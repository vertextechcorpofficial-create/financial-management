import "server-only";

import type { DepositSlip, DepositSlipDetail, DepositSlipItem, ResolvedJournalEntry, UndepositedAsset } from "../types";
import { daysSince, phtDisplayStamp, phtStamp, phtToday } from "../pht";
import { postJournalEntry, PostingBlockedError, resolveJournalEntry } from "./gl.service";
import {
  DirectusError,
  asBoolean,
  asNumber,
  asString,
  createItem,
  deleteItem,
  listItems,
  roundMoney,
  updateItem,
} from "./directus";
import { depositCancelEntry, depositCashEntry } from "../events";

/**
 * Bank Deposit reads and writes.
 *
 * Deposit slips already exist as `bank_deposit` + `bank_deposit_details`, and the
 * money waiting to be deposited is `collection_invoices` (types CASH and ADJUSTMENT), the same
 * 4 = check), so this service reuses them instead of a parallel model. The only new
 * rows are the checks created per deposited check, which feed Check & Clearing.
 */

const CASH = 1;
const CHECK = 4;

const COLLECTION_FIELDS = ["id", "collection_date", "collection_receipt_no", "docNo", "isPosted", "isCancelled"];
const SLIP_FIELDS = [
  "id",
  "deposit_no",
  "deposit_date",
  "target_bank_id",
  "total_cash",
  "total_checks",
  "status",
  "prepared_by",
  "date_prepared",
  "deposit_reference_no",
  "cleared_at",
  "cleared_by",
  "remarks",
];
const ACCOUNT_FIELDS = ["bank_id", "bank_name", "account_number", "account_name"];

type SlipRow = {
  id: number;
  deposit_no: string;
  deposit_date: string;
  target_bank_id: number | null;
  total_cash: number | string | null;
  total_checks: number | string | null;
  status: string;
  prepared_by: string | null;
  date_prepared: string;
  deposit_reference_no: string | null;
  cleared_at: string | null;
  cleared_by: string | null;
  remarks: string | null;
};

export type DepositAccount = {
  bankId: number;
  /** Kept for the slips' one-line bank column; pickers use the two halves below. */
  label: string;
  bankName: string | null;
  accountNumber: string | null;
  glCoaId: number | null;
  glCode: string | null;
  glTitle: string | null;
  /** The account has no linked GL, so E07 falls back to the shared CASH_IN_BANK mapping. */
  glFallback: boolean;
};

type AccountRow = {
  bank_id: number;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
  gl_coa_id: number | null;
};
type CoaRow = { coa_id: number; gl_code: string | null; account_title: string | null };

function accountLabel(row: AccountRow): string {
  return [row.bank_name, row.account_number].filter(Boolean).join(" · ") || `Account ${row.bank_id}`;
}

/** The two halves of the label, so a picker can show the name over its number instead of one clipped string. */
function accountParts(row: AccountRow): { bankName: string | null; accountNumber: string | null } {
  return {
    bankName: asString(row.bank_name).trim() || null,
    accountNumber: asString(row.account_number).trim() || null,
  };
}

function toDepositAccount(row: AccountRow, coa: Map<number, CoaRow>): DepositAccount {
  const glCoaId = row.gl_coa_id == null ? null : Number(row.gl_coa_id);
  const linked = glCoaId == null ? null : coa.get(glCoaId) ?? null;
  return {
    bankId: Number(row.bank_id),
    label: accountLabel(row),
    ...accountParts(row),
    glCoaId,
    glCode: linked?.gl_code ?? null,
    glTitle: linked?.account_title ?? null,
    glFallback: glCoaId == null,
  };
}

async function loadAccounts(): Promise<Map<number, DepositAccount>> {
  const [{ rows: accounts }, { rows: coa }] = await Promise.all([
    listItems<AccountRow>("bank_accounts", { fields: [...ACCOUNT_FIELDS, "gl_coa_id"], limit: 500 }),
    listItems<CoaRow>("chart_of_accounts", { fields: ["coa_id", "gl_code", "account_title"], limit: 500 }),
  ]);
  const coaById = new Map(coa.map((row) => [Number(row.coa_id), row]));
  return new Map(accounts.map((row) => [Number(row.bank_id), toDepositAccount(row, coaById)]));
}

/** One account with its linked GL, for the E07 preview and posting path. */
export async function loadDepositAccount(bankId: number): Promise<DepositAccount | null> {
  const { rows } = await listItems<AccountRow>("bank_accounts", {
    fields: [...ACCOUNT_FIELDS, "gl_coa_id"],
    filter: { bank_id: { _eq: bankId } },
    limit: 1,
  });
  const row = rows[0];
  if (!row) return null;
  const glCoaId = row.gl_coa_id == null ? null : Number(row.gl_coa_id);
  const coa = glCoaId == null ? [] : (await listItems<CoaRow>("chart_of_accounts", {
    fields: ["coa_id", "gl_code", "account_title"],
    filter: { coa_id: { _eq: glCoaId } },
    limit: 1,
  })).rows;
  return toDepositAccount(row, new Map(coa.map((item) => [Number(item.coa_id), item])));
}

function isTruthyFlag(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  // MySQL tinyint(1) columns arrive as `{"type":"Buffer","data":[1]}` through this Directus
  // instance; comparing that object to `true` silently turned every posted collection into
  // "Not posted" (QA-06).
  if (typeof value === "object") {
    const buffered = value as { type?: unknown; data?: unknown };
    if (buffered.type === "Buffer" && Array.isArray(buffered.data)) {
      return buffered.data.some((byte) => Number(byte) !== 0);
    }
    if (Array.isArray(value)) return value.some((item) => Number(item) !== 0);
  }
  return false;
}

/**
 * `collection_details` stores only a customer code. The name lives in `customer`
 * (`customer_code` → `customer_name`), so the queue is readable without a second screen.
 */
async function loadCustomerNames(codes: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(codes.filter(Boolean))];
  if (!unique.length) return new Map();
  const { rows } = await listItems<{ customer_code: string; customer_name: string | null }>("customer", {
    fields: ["customer_code", "customer_name"],
    filter: { customer_code: { _in: unique } },
    limit: 800,
  });
  return new Map(
    rows.filter((row) => asString(row.customer_name)).map((row) => [String(row.customer_code), asString(row.customer_name)]),
  );
}

/** Document numbers for rows that vanished from the queue, so a failure names them. */
async function describeMissing(invoiceIds: number[]): Promise<string> {
  if (!invoiceIds.length) return "the selected rows";
  try {
    const { rows: settlements } = await listItems<{ id: number; collection_id: number | null }>("collection_invoices", {
      fields: ["id", "collection_id"],
      filter: { id: { _in: invoiceIds } },
      limit: 200,
    });
    const collections = [...new Set(settlements.map((row) => Number(row.collection_id)).filter(Boolean))];
    const { rows } = collections.length
      ? await listItems<{ id: number; collection_receipt_no: string | null; docNo: string | null }>("collection", {
          fields: ["id", "collection_receipt_no", "docNo"],
          filter: { id: { _in: collections } },
          limit: 200,
        })
      : { rows: [] };
    const byId = new Map(rows.map((row) => [Number(row.id), row.collection_receipt_no || row.docNo]));
    const labels = settlements.map((row) => byId.get(Number(row.collection_id)) ?? `settlement #${row.id}`);
    return labels.length ? labels.join(", ") : "the selected rows";
  } catch {
    return invoiceIds.map((id) => `settlement #${id}`).join(", ");
  }
}

/** Invoice number and customer for a settlement row: `collection_invoices.invoice_id` is the key. */
async function loadInvoices(
  invoiceIds: number[],
): Promise<Map<number, { invoiceNo: string | null; customerCode: string | null }>> {
  const unique = [...new Set(invoiceIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!unique.length) return new Map();
  const { rows } = await listItems<{ invoice_id: number; invoice_no: string | null; customer_code: string | null }>(
    "sales_invoice",
    { fields: ["invoice_id", "invoice_no", "customer_code"], filter: { invoice_id: { _in: unique } }, limit: 800 },
  );
  return new Map(
    rows.map((row) => [
      Number(row.invoice_id),
      { invoiceNo: row.invoice_no ?? null, customerCode: asString(row.customer_code) || null },
    ]),
  );
}

type SettlementRow = {
  id: number;
  collection_id: number | null;
  invoice_id: number | null;
  amount: number | string | null;
  type: string | null;
};

/**
 * The money waiting to be banked is the settlement row, not the tender line: the Collection
 * Summary reads `collection_invoices` (one row per invoice and money type), which is the only
 * place a customer and an invoice can be named. A receipt's cash tender may cover two invoices,
 * so its settlement rows carry the names the slip has to print.
 */
export async function listUndepositedAssets(): Promise<UndepositedAsset[]> {
  const [{ rows: settlements }, { rows: links }, checkResult] = await Promise.all([
    listItems<SettlementRow>("collection_invoices", {
      fields: ["id", "collection_id", "invoice_id", "amount", "type"],
      filter: { type: { _in: ["CASH", "ADJUSTMENT"] } },
      limit: 800,
    }),
    listItems<{ collection_invoice_id: number | null }>("bank_deposit_details", {
      fields: ["collection_invoice_id"],
      limit: 800,
    }),
    listItems<{ check_no: string | null; source_ref: string | null; drawee_bank: string | null }>("bank_checks", {
      fields: ["check_no", "source_ref", "drawee_bank"],
      filter: { direction: { _eq: "RECEIVED" }, status: { _neq: "CANCELLED" } },
      limit: 800,
    }).catch(() => ({ rows: [] as { check_no: string | null; source_ref: string | null; drawee_bank: string | null }[] })),
  ]);

  const deposited = new Set(links.map((link) => Number(link.collection_invoice_id)));
  const pending = settlements.filter((row) => !deposited.has(Number(row.id)));
  if (!pending.length) return [];

  const collectionIds = [...new Set(pending.map((row) => Number(row.collection_id)).filter(Boolean))];
  const [{ rows: collections }, invoices] = await Promise.all([
    listItems<{
      id: number;
      collection_date: string | null;
      collection_receipt_no: string | null;
      docNo: string | null;
      isPosted: unknown;
      isCancelled: unknown;
    }>("collection", { fields: COLLECTION_FIELDS, filter: { id: { _in: collectionIds } }, limit: 800 }),
    loadInvoices(pending.map((row) => Number(row.invoice_id ?? 0))),
  ]);
  const byId = new Map(collections.map((row) => [Number(row.id), row]));

  // A received cheque names its receipt in `source_ref`, so a settlement row of that receipt
  // knows its cheque number and drawee bank without reading the tender table.
  const checkByRef = new Map<string, { checkNo: string | null; draweeBank: string | null }>();
  for (const check of checkResult.rows) {
    const ref = asString(check.source_ref);
    if (ref && !checkByRef.has(ref)) checkByRef.set(ref, { checkNo: check.check_no, draweeBank: check.drawee_bank });
  }

  const customerNames = await loadCustomerNames(
    pending.map((row) => invoices.get(Number(row.invoice_id ?? 0))?.customerCode ?? ""),
  );

  return pending
    .map((row) => {
      const parent = row.collection_id == null ? undefined : byId.get(Number(row.collection_id));
      const collectionDate = parent?.collection_date ?? null;
      const documentNumber = parent?.collection_receipt_no || parent?.docNo || `#${row.collection_id ?? row.id}`;
      const invoice = invoices.get(Number(row.invoice_id ?? 0));
      const check = checkByRef.get(asString(parent?.collection_receipt_no) || asString(parent?.docNo) || "");
      const customerCode = invoice?.customerCode ?? null;
      return {
        collectionInvoiceId: Number(row.id),
        collectionId: Number(row.collection_id ?? 0),
        invoiceId: row.invoice_id == null ? null : Number(row.invoice_id),
        invoiceNo: invoice?.invoiceNo ?? null,
        documentNumber,
        collectionReference: parent?.docNo ?? null,
        assetType: check ? "CHECK" : "CASH",
        customer: (customerCode ? customerNames.get(customerCode) : undefined) ?? customerCode,
        customerCode,
        bankName: check?.draweeBank ?? null,
        checkNo: check?.checkNo ?? null,
        chequeDate: null,
        collectionDate,
        amount: roundMoney(asNumber(row.amount)),
        ageDays: daysSince(collectionDate),
        alreadyDeposited: false,
        isPosted: isTruthyFlag(parent?.isPosted),
        isCancelled: isTruthyFlag(parent?.isCancelled),
      } satisfies UndepositedAsset;
    })
    // Only rows that can go on a slip belong here (P14): posted, dated, not voided. The
    // queue is not a hiding place for ineligible rows, so there is nothing left to toggle.
    .filter((asset) => asset.isPosted && !asset.isCancelled && asset.collectionDate !== null);
}

export type DepositPreview = { entry: ResolvedJournalEntry; account: DepositAccount };

/**
 * E07 preview for both dialogs. Nothing is written: the same resolver and the same account
 * GL the posting path will use run here, so the panel cannot drift from what posting does.
 */
export async function previewDepositSlip(input: { bankAccountId: number; cashTotal: number }): Promise<DepositPreview> {
  const account = await loadDepositAccount(input.bankAccountId);
  if (!account) throw new NotFoundError(`Bank account ${input.bankAccountId} does not exist.`);
  const entry = await resolveJournalEntry(
    depositCashEntry({ bankId: account.bankId, glCoaId: account.glCoaId }, roundMoney(input.cashTotal), {
      sourceRef: "PREVIEW",
      postingDate: phtToday(),
      description: "Cash deposit",
    }),
  );
  return { entry, account };
}

type UserRow = {
  user_id: number;
  user_fname: string | null;
  user_mname: string | null;
  user_lname: string | null;
  user_email: string | null;
};

/** `prepared_by` stores a `user.user_id`; the modal has to print a person, not `24` (P17). */
async function loadPreparers(ids: number[]): Promise<Map<number, { name: string | null; email: string | null }>> {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (!unique.length) return new Map();
  try {
    const { rows } = await listItems<UserRow>("user", {
      fields: ["user_id", "user_fname", "user_mname", "user_lname", "user_email"],
      filter: { user_id: { _in: unique } },
      limit: 500,
    });
    return new Map(
      rows.map((row) => {
        const name = [row.user_fname, row.user_mname, row.user_lname]
          .map((part) => asString(part).trim())
          .filter(Boolean)
          .join(" ");
        return [Number(row.user_id), { name: name || null, email: asString(row.user_email) || null }];
      }),
    );
  } catch (error) {
    // The user table belongs to another module; a missing read must not blank the slip list.
    if (error instanceof DirectusError) return new Map();
    throw error;
  }
}

/** Itemised contents for the slip list and its read-only modal (P17). */
async function loadSlipItems(slipIds: number[]): Promise<Map<number, DepositSlipItem[]>> {
  const result = new Map<number, DepositSlipItem[]>();
  if (!slipIds.length) return result;
  const { rows: links } = await listItems<{
    id: number;
    bank_deposit_id: number | null;
    collection_invoice_id: number | null;
    amount: number | string | null;
    payment_method: number | null;
    check_no: string | null;
    deposit_status: string | null;
  }>("bank_deposit_details", {
    fields: ["id", "bank_deposit_id", "collection_invoice_id", "amount", "payment_method", "check_no", "deposit_status"],
    filter: { bank_deposit_id: { _in: slipIds } },
    limit: 2000,
  });
  if (!links.length) return result;

  const invoiceRowIds = [...new Set(links.map((link) => Number(link.collection_invoice_id)).filter(Boolean))];
  const { rows: settlements } = invoiceRowIds.length
    ? await listItems<{ id: number; collection_id: number | null; invoice_id: number | null }>("collection_invoices", {
        fields: ["id", "collection_id", "invoice_id"],
        filter: { id: { _in: invoiceRowIds } },
        limit: 2000,
      })
    : { rows: [] as { id: number; collection_id: number | null; invoice_id: number | null }[] };
  const settlementById = new Map(settlements.map((row) => [Number(row.id), row]));
  const collectionIds = [...new Set(settlements.map((row) => Number(row.collection_id)).filter(Boolean))];
  const [{ rows: collections }, invoices] = await Promise.all([
    collectionIds.length
      ? listItems<{ id: number; docNo: string | null; collection_receipt_no: string | null; collection_date: string | null }>(
          "collection",
          { fields: ["id", "docNo", "collection_receipt_no", "collection_date"], filter: { id: { _in: collectionIds } }, limit: 800 },
        )
      : Promise.resolve({
          rows: [] as { id: number; docNo: string | null; collection_receipt_no: string | null; collection_date: string | null }[],
        }),
    loadInvoices(settlements.map((row) => Number(row.invoice_id ?? 0))),
  ]);
  const collectionById = new Map(collections.map((row) => [Number(row.id), row]));
  const customerNames = await loadCustomerNames([...invoices.values()].map((entry) => entry.customerCode ?? ""));

  // One row per invoice, the way the Collection Summary reads: a receipt's cash tender and its
  // adjustment legs are two settlement rows against the same invoice, and splitting them on the
  // slip shows the same customer twice for one invoice.
  const grouped = new Map<string, DepositSlipItem>();
  for (const link of links) {
    const settlement = settlementById.get(Number(link.collection_invoice_id));
    const parent = settlement?.collection_id == null ? undefined : collectionById.get(Number(settlement.collection_id));
    const invoice = invoices.get(Number(settlement?.invoice_id ?? 0));
    const customerCode = invoice?.customerCode ?? null;
    const method = Number(link.payment_method);
    const slipId = Number(link.bank_deposit_id);
    const key = `${slipId}:${settlement?.invoice_id ?? link.id}`;
    const amount = roundMoney(asNumber(link.amount));
    const existing = grouped.get(key);
    if (existing) {
      existing.amount = roundMoney(existing.amount + amount);
      // A cheque anywhere in the invoice makes the row a cheque; otherwise money handed over beats
      // a discount leg, so a cash tender and its adjustment read as one cash row.
      if (method === CHECK) {
        existing.assetType = "CHECK";
        existing.methodLabel = "Check";
        existing.checkNo = existing.checkNo ?? link.check_no;
      } else if (method === CASH && existing.methodLabel !== "Check") {
        existing.methodLabel = "Cash";
      }
      continue;
    }
    grouped.set(key, {
      collectionInvoiceId: Number(link.collection_invoice_id ?? link.id),
      invoiceNo: invoice?.invoiceNo ?? null,
      assetType: method === CHECK ? "CHECK" : "CASH",
      // A settlement row with no method was applied as an adjustment (discount, rounding), not
      // as money handed over, so the badge says what it is instead of calling it cash.
      methodLabel: method === CHECK ? "Check" : method === CASH ? "Cash" : "Adjustment",
      documentNumber: parent?.collection_receipt_no || parent?.docNo || "No receipt recorded",
      checkNo: link.check_no,
      customer: (customerCode ? customerNames.get(customerCode) : undefined) ?? customerCode,
      customerCode,
      collectionDate: parent?.collection_date ?? null,
      amount,
      checkStatus: null,
      lineStatus: asString(link.deposit_status) || "IN_TRANSIT",
    });
  }

  for (const [key, item] of grouped) {
    const slipId = Number(key.slice(0, key.indexOf(":")));
    const bucket = result.get(slipId) ?? [];
    bucket.push(item);
    result.set(slipId, bucket);
  }
  return result;
}

/** A cash item resolves when the slip is deposited; a check when the bank clears or returns it. */
function itemResolved(item: DepositSlipItem): boolean {
  if (item.assetType === "CASH") return item.lineStatus !== "IN_TRANSIT";
  return item.checkStatus === "CLEARED" || item.checkStatus === "RETURNED" || item.checkStatus === "CANCELLED";
}

export async function listDepositSlips(): Promise<DepositSlip[]> {
  const [{ rows }, accounts] = await Promise.all([
    listItems<SlipRow>("bank_deposit", { fields: SLIP_FIELDS, sort: "-deposit_date", limit: 400 }),
    loadAccounts(),
  ]);
  const [itemsBySlip, preparers] = await Promise.all([
    loadSlipItems(rows.map((row) => Number(row.id))),
    loadPreparers(rows.map((row) => Number(row.prepared_by ?? 0))),
  ]);

  return rows.map((row) => {
    const id = Number(row.id);
    const items = itemsBySlip.get(id) ?? [];
    const bouncedCount = items.filter((item) => item.checkStatus === "RETURNED").length;
    const resolvedCount = items.filter(itemResolved).length;
    const pendingCount = items.filter((item) => item.lineStatus === "IN_TRANSIT").length;
    const stored = row.status as DepositSlip["status"];
    // P3/P6: the header never carries a bounce. It is Prepared while any line is still on hand,
    // Deposited once the money has left but a check is still with the bank, and Cleared when every
    // line has resolved. A cash-only slip skips Deposited because cash clears on deposit.
    const status: DepositSlip["status"] =
      stored === "CANCELLED"
        ? "CANCELLED"
        : items.length > 0 && resolvedCount === items.length
          ? "CLEARED"
          : items.length > 0 && pendingCount === items.length
            ? "PREPARED"
            : "DEPOSITED";
    const account = accounts.get(Number(row.target_bank_id));
    const preparer = preparers.get(Number(row.prepared_by ?? 0));
    return {
      id,
      depositNo: row.deposit_no,
      depositDate: row.deposit_date,
      targetBankId: Number(row.target_bank_id ?? 0),
      targetBankLabel: account?.label ?? "—",
      targetBankName: account?.bankName ?? null,
      targetBankNumber: account?.accountNumber ?? null,
      glCode: account?.glCode ?? null,
      glTitle: account?.glTitle ?? null,
      glFallback: account?.glFallback ?? true,
      referenceNo: row.deposit_reference_no,
      validationFileId: null,
      status,
      totalCash: roundMoney(asNumber(row.total_cash)),
      totalChecks: roundMoney(asNumber(row.total_checks)),
      grandTotal: roundMoney(asNumber(row.total_cash) + asNumber(row.total_checks)),
      preparedBy: preparer?.name ?? preparer?.email ?? null,
      preparedByEmail: preparer?.email ?? null,
      datePrepared: row.date_prepared,
      clearedAt: row.cleared_at ? phtDisplayStamp(row.cleared_at) : null,
      clearedBy: row.cleared_by,
      remarks: row.remarks,
      itemCount: items.length,
      bouncedCount,
      resolvedCount,
    };
  });
}

/** One slip with its itemised contents, for the read-only modal (P17). */
export async function getDepositSlipDetail(slipId: number): Promise<DepositSlipDetail> {
  const [slip] = (await listDepositSlips()).filter((row) => row.id === slipId);
  if (!slip) throw new NotFoundError("Deposit slip not found.");
  const items = (await loadSlipItems([slipId])).get(slipId) ?? [];
  return { slip, items };
}

export type CreateSlipInput = {
  bankAccountId: number;
  depositDate: string;
  slipNo: string;
  remarks: string | null;
  cashIds: number[];
  checkIds: number[];
  /** `bank_deposit.prepared_by` is NOT NULL, so the route must resolve the signed-in user first. */
  preparedBy: number | null;
};

export type CreateSlipResult = {
  slip: DepositSlip;
  postingBlocked: { message: string; missingMappingKeys: string[] } | null;
  notice: string | null;
};

function normalizeReference(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

async function nextDepositNo(): Promise<string> {
  const { rows } = await listItems<{ deposit_no: string }>("bank_deposit", {
    fields: ["deposit_no"],
    sort: "-deposit_no",
    limit: 1,
  });
  const current = rows[0]?.deposit_no ?? "";
  const digits = Number(current.replace(/\D/g, "")) || 0;
  return `DEP-${String(digits + 1).padStart(6, "0")}`;
}

/** Directus puts the useful sentence in the error body; surface it instead of "could not be saved". */
function describeDirectusWrite(error: DirectusError, what: string): string {
  try {
    const body = JSON.parse(error.body) as { errors?: { message?: string; extensions?: { field?: string } }[] };
    const first = body.errors?.[0];
    if (first?.message) {
      return `${what}: ${first.message}${first.extensions?.field ? ` (field ${first.extensions.field})` : ""}`;
    }
  } catch {
    // Not JSON; fall through to the status.
  }
  return `${what} was rejected by the database (HTTP ${error.status}).`;
}

export async function createDepositSlip(input: CreateSlipInput): Promise<CreateSlipResult> {
  if (!input.cashIds.length && !input.checkIds.length) {
    throw new ValidationError("Select at least one cash collection or check to deposit.");
  }
  if (input.preparedBy === null) {
    throw new ValidationError("Your session does not carry a user id; sign in again before preparing a slip.");
  }
  if (input.depositDate > phtToday()) {
    throw new ValidationError("Deposit date cannot be in the future.");
  }

  // Only a live account can take money: frozen (INACTIVE), escheated, closed or dormant accounts are out.
  const { rows: targetRows } = await listItems<{ is_active: unknown; account_status: unknown }>("bank_accounts", {
    fields: ["is_active", "account_status"],
    filter: { bank_id: { _eq: input.bankAccountId } },
    limit: 1,
  });
  const target = targetRows[0];
  if (!target) {
    throw new NotFoundError(`Bank account ${input.bankAccountId} does not exist.`);
  }
  const targetStatus = asString(target.account_status) || (asBoolean(target.is_active) ? "ACTIVE" : "INACTIVE");
  if (!asBoolean(target.is_active) || targetStatus !== "ACTIVE") {
    throw new ValidationError(
      `Bank account ${input.bankAccountId} is ${targetStatus.toLowerCase()}; a deposit slip can only be prepared against an active account.`,
    );
  }
  // E07 debits the account's Linked GL from onboarding, never a dummy mapping (P15).
  const account = await loadDepositAccount(input.bankAccountId);

  const assets = await listUndepositedAssets();
  const byId = new Map(assets.map((asset) => [asset.collectionInvoiceId, asset]));

  const cash = input.cashIds.map((id) => byId.get(id)).filter((asset): asset is UndepositedAsset => !!asset && asset.assetType === "CASH");
  const checks = input.checkIds.map((id) => byId.get(id)).filter((asset): asset is UndepositedAsset => !!asset && asset.assetType === "CHECK");

  if (cash.length !== input.cashIds.length || checks.length !== input.checkIds.length) {
    const known = new Set(assets.map((asset) => asset.collectionInvoiceId));
    const missing = [...input.cashIds, ...input.checkIds].filter((id) => !known.has(id));
    throw new ValidationError(
      `These collections are no longer waiting to be deposited: ${await describeMissing(missing)}. Refresh and try again.`,
    );
  }

  const blocked = [...cash, ...checks].filter((asset) => asset.isCancelled || !asset.isPosted || !asset.collectionDate);
  if (blocked.length) {
    const names = blocked
      .map(
        (asset) =>
          `${asset.documentNumber}${asset.isCancelled ? " (voided)" : ""}${!asset.isPosted ? " (not posted)" : ""}${
            !asset.collectionDate ? " (no collected date)" : ""
          }`,
      )
      .join(", ");
    throw new ValidationError(`Post or date these collections before depositing them: ${names}.`);
  }

  const pdc = checks.filter((check) => check.chequeDate && check.chequeDate > input.depositDate);
  if (pdc.length) {
    const names = pdc
      .map((check) => `${check.documentNumber}${check.checkNo ? ` (check ${check.checkNo})` : ""}`)
      .join(", ");
    throw new ValidationError(`Deposit date is before the check date of ${names}.`);
  }
  const oldest = [...cash, ...checks]
    .map((asset) => asset.collectionDate?.slice(0, 10))
    .filter((value): value is string => !!value)
    .sort()[0];
  if (oldest && input.depositDate < oldest) {
    const earliest = [...cash, ...checks]
      .filter((asset) => asset.collectionDate?.slice(0, 10) === oldest)
      .map((asset) => asset.documentNumber)
      .join(", ");
    throw new ValidationError(`Deposit date cannot be earlier than ${oldest}, the collection date of ${earliest}.`);
  }

  const { rows: existing } = await listItems<{ id: number; deposit_reference_no: string | null; status: string }>("bank_deposit", {
    fields: ["id", "deposit_reference_no", "status"],
    filter: { target_bank_id: { _eq: input.bankAccountId } },
    limit: 500,
  });
  const wanted = normalizeReference(input.slipNo);
  const clash = existing.some(
    (row) => row.status !== "CANCELLED" && normalizeReference(row.deposit_reference_no ?? "") === wanted,
  );
  if (clash) {
    throw new ValidationError(`Slip / validation no. "${input.slipNo}" is already used on this account.`, "slipNo");
  }

  const cashTotal = roundMoney(cash.reduce((sum, asset) => sum + asset.amount, 0));
  const checkTotal = roundMoney(checks.reduce((sum, asset) => sum + asset.amount, 0));
  const depositNo = await nextDepositNo();

  let created: { id: number };
  try {
    created = await createItem<{ id: number }>("bank_deposit", {
      deposit_no: depositNo,
      deposit_date: input.depositDate,
      target_bank_id: input.bankAccountId,
      total_cash: cashTotal,
      total_checks: checkTotal,
      status: "PREPARED",
      date_prepared: phtStamp(),
      prepared_by: input.preparedBy,
      deposit_reference_no: input.slipNo,
      remarks: input.remarks,
    });
  } catch (error) {
    if (error instanceof DirectusError) {
      throw new ValidationError(describeDirectusWrite(error, `Deposit slip ${input.slipNo}`));
    }
    throw error;
  }

  try {
    for (const asset of [...cash, ...checks]) {
      await createItem("bank_deposit_details", {
        bank_deposit_id: created.id,
        // The line is the only place the method and the cheque survive: the settlement row
        // behind it knows the customer and the invoice, never how the money arrived.
        collection_invoice_id: asset.collectionInvoiceId,
        amount: asset.amount,
        payment_method: asset.assetType === "CHECK" ? CHECK : CASH,
        check_no: asset.checkNo,
        cheque_date: asset.chequeDate,
        deposit_status: "IN_TRANSIT",
        created_at: phtStamp(),
      });
    }
  } catch (error) {
    if (error instanceof DirectusError) {
      throw new ValidationError(
        `${describeDirectusWrite(error, `Deposit slip ${depositNo} was saved but a collection could not be attached`)}. Remove the slip before retrying.`,
      );
    }
    throw error;
  }

  let notice: string | null = null;
  let postingBlocked: CreateSlipResult["postingBlocked"] = null;

  try {
    for (const check of checks) {
      await createItem("bank_checks", {
        bank_account_id: input.bankAccountId,
        direction: "RECEIVED",
        check_no: check.checkNo ?? `DEP-${check.collectionInvoiceId}`,
        check_date: check.chequeDate ?? input.depositDate,
        amount: check.amount,
        drawee_bank: check.bankName,
        payor: check.customer,
        status: "IN_CLEARING",
        is_pdc: 0,
        source_type: "COLLECTIONS",
        source_ref: depositNo,
        collection_detail_id: check.collectionInvoiceId,
        created_at: phtStamp(),
      });
    }
  } catch (error) {
    if (error instanceof DirectusError) {
      notice = "Checks were added to the slip but the check register is not available yet, so clearing cannot be tracked.";
    } else {
      throw error;
    }
  }

  if (cashTotal > 0) {
    try {
      await postJournalEntry(
        depositCashEntry(
          { bankId: input.bankAccountId, glCoaId: account?.glCoaId ?? null },
          cashTotal,
          {
            sourceRef: depositNo,
            postingDate: input.depositDate,
            description: `Bank deposit ${depositNo} (${input.slipNo})`,
          },
        ),
        null,
      );
    } catch (error) {
      if (error instanceof PostingBlockedError) {
        postingBlocked = { message: error.message, missingMappingKeys: error.missingMappingKeys };
      } else {
        throw error;
      }
    }
  }

  const [slip] = (await listDepositSlips()).filter((row) => row.id === created.id);
  return { slip, postingBlocked, notice };
}

/**
 * Marks a prepared slip as taken by the bank. The header records the handover, cash lines are
 * banked at once, and cheque lines wait for clearing — the method comes from our own line, which
 * is the only place it survives (`collection_invoices` knows the invoice, never the tender).
 */
export async function markDepositSlipDeposited(
  slipId: number,
  confirmation: { depositDate?: string; slipNo?: string },
): Promise<DepositSlip> {
  const { rows } = await listItems<SlipRow>("bank_deposit", { fields: SLIP_FIELDS, filter: { id: { _eq: slipId } }, limit: 1 });
  const slip = rows[0];
  if (!slip) throw new NotFoundError("Deposit slip not found.");
  if (slip.status === "CANCELLED") throw new ValidationError("A cancelled slip cannot be marked as deposited.");
  if (slip.status === "DEPOSITED" || slip.status === "CLEARED") {
    throw new ValidationError("This slip is already through the bank.");
  }

  // Validate the handover facts before anything is written, so a typo cannot leave the lines moved.
  const depositDate = asString(confirmation.depositDate).trim();
  if (depositDate && !/^\d{4}-\d{2}-\d{2}$/.test(depositDate)) {
    throw new ValidationError("The deposit date looks wrong. Use a date like 2026-11-20.");
  }
  const slipNo = asString(confirmation.slipNo).trim();
  if (slipNo && slipNo.length > 40) throw new ValidationError("The validation number is too long.");

  const { rows: details } = await listItems<{ id: number; payment_method: number | null }>("bank_deposit_details", {
    fields: ["id", "payment_method"],
    filter: { bank_deposit_id: { _eq: slipId } },
    limit: 400,
  });
  if (!details.length) throw new ValidationError("This slip carries no items, so there is nothing to deposit.");

  for (const detail of details) {
    const isCheck = Number(detail.payment_method) === CHECK;
    await updateItem("bank_deposit_details", Number(detail.id), {
      deposit_status: isCheck ? "FOR_CLEARING" : "DEPOSITED",
    });
  }
  await updateItem("bank_deposit", slipId, {
    status: "DEPOSITED",
    ...(depositDate ? { deposit_date: depositDate } : {}),
    ...(slipNo ? { deposit_reference_no: slipNo } : {}),
  });

  const slips = await listDepositSlips();
  const updated = slips.find((entry) => entry.id === slipId);
  if (!updated) throw new NotFoundError("Deposit slip not found.");
  return updated;
}

export async function cancelDepositSlip(slipId: number, reason: string): Promise<DepositSlip> {
  const { rows } = await listItems<SlipRow>("bank_deposit", { fields: SLIP_FIELDS, filter: { id: { _eq: slipId } }, limit: 1 });
  const slip = rows[0];
  if (!slip) throw new NotFoundError("Deposit slip not found.");
  if (slip.status === "CANCELLED") throw new ValidationError("This slip is already cancelled.");
  // The spec contradicts itself here: rule P7 allows a cancel only while "zero items have cleared",
  // but the workflow's cancel row describes reversing the cash E07 — which only exists on a slip
  // whose cash already cleared. The workflow row wins, because it is the one that names a posting:
  // cancel stays open while the header is Prepared and no check has left the bank's hands, and the
  // cash side is reversed with E08 below. Dropping the derived-CLEARED refusal is what makes that
  // possible; the check guard underneath still blocks a slip whose checks have cleared or returned.

  const { rows: links } = await listItems<{ id: number; collection_detail_id: number | null }>("bank_deposit_details", {
    fields: ["id", "collection_detail_id"],
    filter: { bank_deposit_id: { _eq: slipId } },
    limit: 200,
  });
  const detailIds = links.map((link) => Number(link.collection_detail_id)).filter(Boolean);

  let checkIds: number[] = [];
  if (detailIds.length) {
    try {
      const { rows: checks } = await listItems<{ id: number; status: string }>("bank_checks", {
        fields: ["id", "status"],
        filter: { collection_detail_id: { _in: detailIds }, direction: { _eq: "RECEIVED" } },
        limit: 200,
      });
      const blocking = checks.filter((check) => check.status !== "IN_CLEARING");
      if (blocking.length) {
        throw new ValidationError("A check on this slip has already cleared or been returned, so the slip cannot be cancelled.");
      }
      checkIds = checks.map((check) => Number(check.id));
    } catch (error) {
      if (error instanceof DirectusError) {
        // The check register does not exist yet, so there is nothing to validate against.
      } else {
        throw error;
      }
    }
  }

  // A slip from the legacy table can carry checks with no register row, so the guard above has
  // nothing to inspect. Refuse rather than reverse cash the bank may already have credited.
  if (asNumber(slip.total_checks) > 0 && checkIds.length === 0) {
    throw new ValidationError(
      "The checks on this slip are not linked to the check register, so the slip cannot be cancelled here.",
    );
  }

  const cashTotal = roundMoney(asNumber(slip.total_cash));
  if (cashTotal > 0) {
    const account = await loadDepositAccount(Number(slip.target_bank_id ?? 0));
    await postJournalEntry(
      depositCancelEntry(
        { bankId: Number(slip.target_bank_id ?? 0), glCoaId: account?.glCoaId ?? null },
        cashTotal,
        {
          sourceRef: slip.deposit_no,
          postingDate: phtToday(),
          description: `Deposit slip ${slip.deposit_no} cancelled — ${reason}`,
        },
      ),
      null,
    );
  }

  for (const checkId of checkIds) {
    await updateCheckBackToVault(checkId);
  }
  for (const link of links) {
    await deleteItem("bank_deposit_details", link.id);
  }

  await updateItemStatus(slipId);

  const [cancelled] = (await listDepositSlips()).filter((row) => row.id === slipId);
  return cancelled;
}

async function updateCheckBackToVault(checkId: number) {
  await updateItem("bank_checks", checkId, {
    status: "RECEIVED",
    deposited_at: null,
    updated_at: phtStamp(),
  });
}

async function updateItemStatus(slipId: number) {
  await updateItem("bank_deposit", slipId, { status: "CANCELLED" });
}

export class ValidationError extends Error {
  field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export function assetLabel(asset: UndepositedAsset): string {
  return asset.assetType === "CASH"
    ? `Cash · ${asset.documentNumber}`
    : `Check ${asString(asset.checkNo) || "—"} · ${asset.bankName ?? "—"}`;
}
