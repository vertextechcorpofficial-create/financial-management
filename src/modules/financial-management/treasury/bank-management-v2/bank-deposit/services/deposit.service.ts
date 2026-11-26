import "server-only";

import type {
  DepositSlip,
  DepositSlipDetail,
  DepositSlipItem,
  JournalEntryDraft,
  ResolvedJournalEntry,
  UndepositedAsset,
} from "../types";
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
import { depositCancelEntry, depositCashEntry, receivedCheckEntry } from "../events";

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

/**
 * Settlement types that put money in the drawer. MEMO is a note, DRAFT is not posted yet, EWT is
 * tax withheld before the money reached us, and RETURN takes money back out.
 */
const DEPOSITABLE_TYPES = ["CASH", "CHECK", "ADJUSTMENT"] as const;

type SettlementRow = {
  id: number;
  collection_id: number | null;
  invoice_id: number | null;
  amount: number | string | null;
  type: string | null;
};

/**
 * Invoices settled short. An adjustment tender with remarks starting `adj-` and a balance side of
 * 2 is a shortage; balance side 1 is an overage, which is money the customer did pay.
 * `invoice_id` is the identifier both tables carry, so the match is on it. A handful of old
 * adjustment rows never recorded an invoice, and those would leak their settlement line back into
 * the queue as if it were cash, so for those only, the amount within the same receipt identifies it.
 */
async function loadShortageInvoices(
  collectionIds: number[],
): Promise<{ invoices: Set<number>; unlinkedAmounts: Set<string> }> {
  if (!collectionIds.length) return { invoices: new Set(), unlinkedAmounts: new Set() };
  const { rows } = await listItems<{ invoice_id: number | null; collection_id: number | null; amount: number | string | null }>(
    "collection_details",
    {
      fields: ["invoice_id", "collection_id", "amount"],
      filter: {
        collection_id: { _in: collectionIds },
        balance_type_id: { _eq: 2 },
        remarks: { _starts_with: "adj-" },
      },
      limit: 800,
    },
  );
  const invoices = new Set<number>();
  const unlinkedAmounts = new Set<string>();
  for (const row of rows) {
    const invoiceId = Number(row.invoice_id ?? 0);
    if (Number.isInteger(invoiceId) && invoiceId > 0) {
      invoices.add(invoiceId);
      continue;
    }
    unlinkedAmounts.add(`${Number(row.collection_id ?? 0)}:${roundMoney(asNumber(row.amount)).toFixed(2)}`);
  }
  return { invoices, unlinkedAmounts };
}

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
      // A receipt settles with cash, cheques and the odd adjustment. Leaving CHECK out is why a
      // cheque-funded receipt showed only its 21.00 adjustment instead of the money that arrived.
      filter: { type: { _in: DEPOSITABLE_TYPES } },
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
  const shortageInvoices = await loadShortageInvoices([
    ...new Set(settlements.map((row) => Number(row.collection_id)).filter(Boolean)),
  ]);
  const pending = settlements.filter((row) => {
    if (deposited.has(Number(row.id))) return false;
    if (asString(row.type) !== "ADJUSTMENT") return true;
    // A shortage adjustment (`adj-…`, balance_type_id 2) has no money to bank: the customer paid
    // less than the invoice, so a slip carrying it would deposit a negative hole. Overage
    // (balance_type_id 1) is real cash and stays. invoice_id is the identifier both tables share;
    // the amount is consulted only for the old rows that never recorded one.
    const invoiceId = Number(row.invoice_id ?? 0);
    if (invoiceId > 0) return !shortageInvoices.invoices.has(invoiceId);
    const key = `${Number(row.collection_id ?? 0)}:${roundMoney(asNumber(row.amount)).toFixed(2)}`;
    return !shortageInvoices.unlinkedAmounts.has(key);
  });
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
        // The settlement type says what arrived; the cheque lookup only adds the number and bank.
        assetType: check || asString(row.type) === "CHECK" ? "CHECK" : "CASH",
        methodLabel:
          check || asString(row.type) === "CHECK" ? "Check" : asString(row.type) === "ADJUSTMENT" ? "Adjustment" : "Cash",
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

export type DepositPreview = { entries: ResolvedJournalEntry[]; account: DepositAccount };

/**
 * E07 and E12 preview for both dialogs. Nothing is written: the same resolver and the same
 * account GL the posting path will use run here, so the panel cannot drift from what posting
 * does. One entry per posting side, in the order `createDepositSlip` writes them.
 */
export async function previewDepositSlip(input: {
  bankAccountId: number;
  cashTotal: number;
  checkTotal: number;
}): Promise<DepositPreview> {
  const account = await loadDepositAccount(input.bankAccountId);
  if (!account) throw new NotFoundError(`Bank account ${input.bankAccountId} does not exist.`);
  const glAccount = { bankId: account.bankId, glCoaId: account.glCoaId };
  const base = { sourceRef: "PREVIEW", postingDate: phtToday() };
  const cash = roundMoney(input.cashTotal);
  const checks = roundMoney(input.checkTotal);
  const drafts: JournalEntryDraft[] = [];
  if (cash > 0) drafts.push(depositCashEntry(glAccount, cash, { ...base, description: "Cash deposit" }));
  if (checks > 0) drafts.push(receivedCheckEntry("E12", glAccount, checks, { ...base, description: "Check deposit" }));
  const entries = await Promise.all(drafts.map((draft) => resolveJournalEntry(draft)));
  return { entries, account };
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

  // Load slip headers for all slips so we have deposit_no (to join bank_checks) and
  // total_checks (to type legacy lines that predate receipt links).
  const { rows: headers } = await listItems<{ id: number; deposit_no: string | null; total_checks: number | string | null }>(
    "bank_deposit",
    {
      fields: ["id", "deposit_no", "total_checks"],
      filter: { id: { _in: slipIds } },
      limit: 500,
    },
  );
  const slipChecks = new Map<number, number>();
  const slipNoById = new Map<number, string>();
  for (const header of headers) {
    const id = Number(header.id);
    slipChecks.set(id, asNumber(header.total_checks));
    const depNo = asString(header.deposit_no).trim();
    if (depNo) slipNoById.set(id, depNo);
  }

  type BankCheckRow = {
    id: number;
    check_no: string | null;
    check_date: string | null;
    payor: string | null;
    drawee_bank: string | null;
    status: string | null;
    source_ref: string | null;
    collection_detail_id: number | null;
  };
  const slipNos = [...new Set(slipNoById.values())];
  const checkOrFilters: Record<string, unknown>[] = [];
  if (invoiceRowIds.length) checkOrFilters.push({ collection_detail_id: { _in: invoiceRowIds } });
  if (slipNos.length) checkOrFilters.push({ source_ref: { _in: slipNos } });

  const { rows: checkRows } = checkOrFilters.length
    ? await listItems<BankCheckRow>("bank_checks", {
        fields: ["id", "check_no", "check_date", "payor", "drawee_bank", "status", "source_ref", "collection_detail_id"],
        filter: { direction: { _eq: "RECEIVED" }, _or: checkOrFilters },
        limit: 2000,
      }).catch(() => ({ rows: [] as BankCheckRow[] }))
    : { rows: [] as BankCheckRow[] };

  const checkByDetailId = new Map<number, BankCheckRow>();
  const checkBySlipAndNo = new Map<string, BankCheckRow>();
  const checkBySlip = new Map<string, BankCheckRow>();
  for (const row of checkRows) {
    const detailId = Number(row.collection_detail_id ?? 0);
    if (detailId > 0 && !checkByDetailId.has(detailId)) checkByDetailId.set(detailId, row);
    const ref = asString(row.source_ref).trim();
    const chkNo = asString(row.check_no).trim();
    if (ref && chkNo && !checkBySlipAndNo.has(`${ref}:${chkNo}`)) checkBySlipAndNo.set(`${ref}:${chkNo}`, row);
    if (ref && !checkBySlip.has(ref)) checkBySlip.set(ref, row);
  }

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
    // No settlement row: this line cannot name a receipt, a customer or a tender, so it is
    // labelled legacy and typed from the slip header instead of being guessed as cash.
    const legacy = !settlement;
    const isCheck = legacy
      ? method === CHECK || link.check_no != null || (slipChecks.get(slipId) ?? 0) > 0
      : method === CHECK;
    const depositNo = slipNoById.get(slipId) ?? "";
    const matchedCheck =
      (link.collection_invoice_id != null ? checkByDetailId.get(Number(link.collection_invoice_id)) : undefined) ??
      (depositNo && link.check_no ? checkBySlipAndNo.get(`${depositNo}:${asString(link.check_no).trim()}`) : undefined) ??
      (isCheck && legacy && depositNo ? checkBySlip.get(depositNo) : undefined);
    const resolvedCheckStatus = (matchedCheck?.status as DepositSlipItem["checkStatus"]) ?? null;

    const existing = grouped.get(key);
    if (existing) {
      existing.amount = roundMoney(existing.amount + amount);
      // A cheque anywhere in the invoice makes the row a cheque; otherwise money handed over beats
      // a discount leg, so a cash tender and its adjustment read as one cash row.
      if (method === CHECK) {
        existing.assetType = "CHECK";
        existing.methodLabel = "Check";
        existing.checkNo = existing.checkNo ?? link.check_no ?? matchedCheck?.check_no ?? null;
      } else if (method === CASH && existing.methodLabel !== "Check") {
        existing.methodLabel = "Cash";
      }
      if (!existing.checkStatus && resolvedCheckStatus) {
        existing.checkStatus = resolvedCheckStatus;
      }
      continue;
    }
    const resolvedCustomer =
      (customerCode ? customerNames.get(customerCode) : undefined) ?? customerCode ?? matchedCheck?.payor ?? null;
    grouped.set(key, {
      collectionInvoiceId: Number(link.collection_invoice_id ?? link.id),
      invoiceNo: invoice?.invoiceNo ?? null,
      assetType: isCheck ? "CHECK" : "CASH",
      // A settlement row with no method was applied as an adjustment (discount, rounding), not
      // as money handed over, so the badge says what it is instead of calling it cash.
      methodLabel: legacy
        ? isCheck
          ? "Check"
          : "Cash"
        : method === CHECK
          ? "Check"
          : method === CASH
            ? "Cash"
            : "Adjustment",
      documentNumber: legacy
        ? matchedCheck?.check_no || depositNo || "Legacy line — prepared before receipt links"
        : parent?.collection_receipt_no || parent?.docNo || "No receipt recorded",
      checkNo: link.check_no ?? matchedCheck?.check_no ?? null,
      customer: resolvedCustomer,
      customerCode,
      collectionDate: parent?.collection_date ?? matchedCheck?.check_date ?? null,
      amount,
      checkStatus: resolvedCheckStatus,
      lineStatus: asString(link.deposit_status) || "IN_TRANSIT",
      legacy,
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

/**
 * A cash item resolves when the slip is deposited; a check when the bank clears or returns it.
 * A legacy line was written before receipt links existed: it has no settlement row and no check
 * record, so the slip's own deposit status is the only evidence there is, and it is the one that counts.
 */
function itemResolved(item: DepositSlipItem): boolean {
  if (item.legacy) return item.lineStatus !== "IN_TRANSIT";
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
    // P3/P6: the header never carries a bounce. It is Prepared while every line is still on hand,
    // Deposited once the bank has taken the slip, and Cleared only when the slip carried checks and
    // the bank has answered for all of them. Cash needs no answer beyond the deposit, so a cash-only
    // slip settles at Deposited; calling it Cleared would claim a clearing step that never happened.
    const checkLines = items.filter((item) => item.assetType === "CHECK");
    const checksAnswered = checkLines.length > 0 && checkLines.every(
      (item) => item.checkStatus === "CLEARED" || item.checkStatus === "RETURNED" || item.checkStatus === "CANCELLED",
    );
    const status: DepositSlip["status"] =
      stored === "CANCELLED"
        ? "CANCELLED"
        : checksAnswered
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

  const glAccount = { bankId: input.bankAccountId, glCoaId: account?.glCoaId ?? null };
  const postBase = {
    sourceRef: depositNo,
    postingDate: input.depositDate,
    description: `Bank deposit ${depositNo} (${input.slipNo})`,
  };
  const drafts: JournalEntryDraft[] = [];
  if (cashTotal > 0) drafts.push(depositCashEntry(glAccount, cashTotal, postBase));
  // A cheque on a deposit slip is a customer settlement landing in clearing, not cash in the
  // bank, so it posts E12 next to the E07 for any cash on the same slip.
  if (checkTotal > 0) drafts.push(receivedCheckEntry("E12", glAccount, checkTotal, postBase));

  for (const draft of drafts) {
    try {
      await postJournalEntry(draft, null);
    } catch (error) {
      if (error instanceof PostingBlockedError) {
        postingBlocked ??= { message: error.message, missingMappingKeys: error.missingMappingKeys };
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

  const { rows: links } = await listItems<{ id: number; check_no: string | null }>("bank_deposit_details", {
    fields: ["id", "check_no"],
    filter: { bank_deposit_id: { _eq: slipId } },
    limit: 200,
  });
  const checkNumbers = links.map((link) => asString(link.check_no).trim()).filter(Boolean);

  let checkIds: number[] = [];
  if (checkNumbers.length) {
    const { rows: checks } = await listItems<{ id: number; status: string }>("bank_checks", {
      fields: ["id", "status"],
      filter: { check_no: { _in: checkNumbers }, direction: { _eq: "RECEIVED" } },
      limit: 200,
    });
    const blocking = checks.filter((check) => check.status !== "IN_CLEARING" && check.status !== "RECEIVED");
    if (blocking.length) {
      throw new ValidationError("A check on this slip has already cleared or been returned, so the slip cannot be cancelled.");
    }
    checkIds = checks.map((check) => Number(check.id));
  }

  // A slip from the legacy table can carry checks with no register row, so the guard above has
  // nothing to inspect. Refuse rather than reverse cash the bank may already have credited.
  if (asNumber(slip.total_checks) > 0 && checkIds.length === 0) {
    throw new ValidationError(
      "The checks on this slip are not linked to the check register, so the slip cannot be cancelled here.",
    );
  }

  const cashTotal = roundMoney(asNumber(slip.total_cash));
  const checkTotal = roundMoney(asNumber(slip.total_checks));
  if (cashTotal > 0 || checkTotal > 0) {
    const account = await loadDepositAccount(Number(slip.target_bank_id ?? 0));
    const glAccount = { bankId: Number(slip.target_bank_id ?? 0), glCoaId: account?.glCoaId ?? null };
    const postBase = {
      sourceRef: slip.deposit_no,
      postingDate: phtToday(),
      description: `Deposit slip ${slip.deposit_no} cancelled — ${reason}`,
    };
    if (cashTotal > 0) await postJournalEntry(depositCancelEntry(glAccount, cashTotal, postBase), null);
    // E12 put the cheque in clearing; E14 takes it back out, so cancelling reverses both sides.
    if (checkTotal > 0) await postJournalEntry(receivedCheckEntry("E14", glAccount, checkTotal, postBase), null);
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
