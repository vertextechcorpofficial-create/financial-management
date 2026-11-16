import "server-only";

import type { CheckStatus, DepositSlip, DepositSlipDetail, DepositSlipItem, ResolvedJournalEntry, UndepositedAsset } from "../types";
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
 * money waiting to be deposited is `collection_details` (payment_method 1 = cash,
 * 4 = check), so this service reuses them instead of a parallel model. The only new
 * rows are the checks created per deposited check, which feed Check & Clearing.
 */

const CASH = 1;
const CHECK = 4;

const DETAIL_FIELDS = [
  "id",
  "collection_id",
  "payment_method",
  "check_no",
  "chequeDate",
  "amount",
  "bank",
  "customer_code",
  "is_cleared",
];
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

type DetailRow = {
  id: number;
  collection_id: number | null;
  payment_method: number | null;
  check_no: string | null;
  chequeDate: string | null;
  amount: number | string | null;
  bank: string | null;
  customer_code: string | null;
  is_cleared: unknown;
};

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
  label: string;
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

function toDepositAccount(row: AccountRow, coa: Map<number, CoaRow>): DepositAccount {
  const glCoaId = row.gl_coa_id == null ? null : Number(row.gl_coa_id);
  const linked = glCoaId == null ? null : coa.get(glCoaId) ?? null;
  return {
    bankId: Number(row.bank_id),
    label: accountLabel(row),
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

/**
 * `collection_details.bank` stores the `bank_names` id as text, so the register printed bare numbers
 * until this lookup. Missing ids fall back to the raw value rather than blanking the cell.
 */
async function loadBankNames(): Promise<Map<string, string>> {
  const { rows } = await listItems<{ id: number; bank_name: string | null }>("bank_names", {
    fields: ["id", "bank_name"],
    limit: 500,
  });
  return new Map(
    rows.filter((row) => row.bank_name).map((row) => [String(row.id), String(row.bank_name)]),
  );
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
async function describeMissing(detailIds: number[]): Promise<string> {
  if (!detailIds.length) return "the selected rows";
  try {
    const { rows: details } = await listItems<{ id: number; collection_id: number | null }>("collection_details", {
      fields: ["id", "collection_id"],
      filter: { id: { _in: detailIds } },
      limit: 200,
    });
    const collections = [...new Set(details.map((row) => Number(row.collection_id)).filter(Boolean))];
    const { rows } = collections.length
      ? await listItems<{ id: number; collection_receipt_no: string | null; docNo: string | null }>("collection", {
          fields: ["id", "collection_receipt_no", "docNo"],
          filter: { id: { _in: collections } },
          limit: 200,
        })
      : { rows: [] };
    const byId = new Map(rows.map((row) => [Number(row.id), row.collection_receipt_no || row.docNo]));
    const labels = details.map((row) => byId.get(Number(row.collection_id)) ?? `detail #${row.id}`);
    return labels.length ? labels.join(", ") : "the selected rows";
  } catch {
    return detailIds.map((id) => `detail #${id}`).join(", ");
  }
}

/** Cash and customer checks in the vault that are not on a live deposit slip yet. */
export async function listUndepositedAssets(): Promise<UndepositedAsset[]> {
  const [{ rows: details }, { rows: links }] = await Promise.all([
    listItems<DetailRow>("collection_details", {
      fields: DETAIL_FIELDS,
      filter: { payment_method: { _in: [CASH, CHECK] } },
      limit: 800,
    }),
    listItems<{ collection_detail_id: number | null; bank_deposit_id: number | null }>("bank_deposit_details", {
      fields: ["collection_detail_id", "bank_deposit_id"],
      limit: 800,
    }),
  ]);

  const deposited = new Set(links.map((link) => Number(link.collection_detail_id)));
  const pending = details.filter((row) => !isTruthyFlag(row.is_cleared) && !deposited.has(Number(row.id)));
  if (!pending.length) return [];

  const collectionIds = [...new Set(pending.map((row) => Number(row.collection_id)).filter(Boolean))];
  const { rows: collections } = await listItems<{
    id: number;
    collection_date: string | null;
    collection_receipt_no: string | null;
    docNo: string | null;
    isPosted: unknown;
    isCancelled: unknown;
  }>("collection", { fields: COLLECTION_FIELDS, filter: { id: { _in: collectionIds } }, limit: 800 });
  const byId = new Map(collections.map((row) => [Number(row.id), row]));
  const [bankNames, customerNames] = await Promise.all([
    loadBankNames(),
    loadCustomerNames(pending.map((row) => asString(row.customer_code))),
  ]);

  return pending
    .map((row) => {
      const parent = row.collection_id == null ? undefined : byId.get(Number(row.collection_id));
      const collectionDate = parent?.collection_date ?? null;
      const isCash = Number(row.payment_method) === CASH;
      const code = asString(row.customer_code) || null;
      const name = code ? customerNames.get(code) : undefined;
      return {
        collectionDetailId: Number(row.id),
        collectionId: Number(row.collection_id ?? 0),
        documentNumber: parent?.collection_receipt_no || parent?.docNo || `#${row.collection_id ?? row.id}`,
        collectionReference: parent?.docNo ?? null,
        assetType: isCash ? "CASH" : "CHECK",
        customer: name ?? code,
        customerCode: code,
        bankName: bankNames.get(asString(row.bank)) ?? asString(row.bank) ?? null,
        checkNo: row.check_no,
        chequeDate: row.chequeDate,
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

type SlipItemRow = {
  id: number;
  bank_deposit_id: number;
  collection_detail_id: number | null;
};
type ItemDetailRow = {
  id: number;
  collection_id: number | null;
  payment_method: number | null;
  check_no: string | null;
  amount: number | string | null;
  customer_code: string | null;
};

/** Itemised contents for the slip list and its read-only modal (P17). */
async function loadSlipItems(slipIds: number[]): Promise<Map<number, DepositSlipItem[]>> {
  const result = new Map<number, DepositSlipItem[]>();
  if (!slipIds.length) return result;
  const { rows: links } = await listItems<SlipItemRow>("bank_deposit_details", {
    fields: ["id", "bank_deposit_id", "collection_detail_id"],
    filter: { bank_deposit_id: { _in: slipIds } },
    limit: 2000,
  });
  if (!links.length) return result;

  const detailIds = [...new Set(links.map((link) => Number(link.collection_detail_id)).filter(Boolean))];
  const [{ rows: details }, { rows: checks }] = await Promise.all([
    listItems<ItemDetailRow>("collection_details", {
      fields: ["id", "collection_id", "payment_method", "check_no", "amount", "customer_code"],
      filter: { id: { _in: detailIds } },
      limit: 2000,
    }),
    listItems<{ collection_detail_id: number | null; status: string }>("bank_checks", {
      fields: ["collection_detail_id", "status"],
      filter: { collection_detail_id: { _in: detailIds }, direction: { _eq: "RECEIVED" } },
      limit: 2000,
    }).catch((error: unknown) => {
      if (error instanceof DirectusError) return { rows: [] as { collection_detail_id: number | null; status: string }[] };
      throw error;
    }),
  ]);
  const detailById = new Map(details.map((row) => [Number(row.id), row]));
  const collectionIds = [...new Set(details.map((row) => Number(row.collection_id)).filter(Boolean))];
  const { rows: collections } = collectionIds.length
    ? await listItems<{ id: number; docNo: string | null; collection_receipt_no: string | null; collection_date: string | null }>(
        "collection",
        { fields: ["id", "docNo", "collection_receipt_no", "collection_date"], filter: { id: { _in: collectionIds } }, limit: 800 },
      )
    : { rows: [] };
  const collectionById = new Map(collections.map((row) => [Number(row.id), row]));
  const customerNames = await loadCustomerNames(details.map((row) => asString(row.customer_code)));
  const checkByDetail = new Map(checks.map((row) => [Number(row.collection_detail_id), row.status as CheckStatus]));

  for (const link of links) {
    const detail = detailById.get(Number(link.collection_detail_id));
    if (!detail) continue;
    const parent = detail.collection_id == null ? undefined : collectionById.get(Number(detail.collection_id));
    const code = asString(detail.customer_code) || null;
    const item: DepositSlipItem = {
      collectionDetailId: Number(detail.id),
      assetType: Number(detail.payment_method) === CASH ? "CASH" : "CHECK",
      documentNumber: parent?.collection_receipt_no || parent?.docNo || `detail #${detail.id}`,
      checkNo: detail.check_no,
      customer: (code ? customerNames.get(code) : undefined) ?? code,
      customerCode: code,
      collectionDate: parent?.collection_date ?? null,
      amount: roundMoney(asNumber(detail.amount)),
      checkStatus: checkByDetail.get(Number(detail.id)) ?? null,
    };
    const slipId = Number(link.bank_deposit_id);
    const bucket = result.get(slipId) ?? [];
    bucket.push(item);
    result.set(slipId, bucket);
  }
  return result;
}

/** A cash item resolves when the slip is saved; a check when the bank clears or returns it. */
function itemResolved(item: DepositSlipItem): boolean {
  if (item.assetType === "CASH") return true;
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
    const stored = row.status as DepositSlip["status"];
    // P3/P6: the header never carries a bounce. It is Prepared until every item has resolved,
    // then Cleared; the bounce count rides alongside as its own badge.
    const status: DepositSlip["status"] =
      stored === "CANCELLED" ? "CANCELLED" : items.length > 0 && resolvedCount === items.length ? "CLEARED" : "PREPARED";
    const account = accounts.get(Number(row.target_bank_id));
    const preparer = preparers.get(Number(row.prepared_by ?? 0));
    return {
      id,
      depositNo: row.deposit_no,
      depositDate: row.deposit_date,
      targetBankId: Number(row.target_bank_id ?? 0),
      targetBankLabel: account?.label ?? "—",
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
  const byId = new Map(assets.map((asset) => [asset.collectionDetailId, asset]));

  const cash = input.cashIds.map((id) => byId.get(id)).filter((asset): asset is UndepositedAsset => !!asset && asset.assetType === "CASH");
  const checks = input.checkIds.map((id) => byId.get(id)).filter((asset): asset is UndepositedAsset => !!asset && asset.assetType === "CHECK");

  if (cash.length !== input.cashIds.length || checks.length !== input.checkIds.length) {
    const known = new Set(assets.map((asset) => asset.collectionDetailId));
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
        collection_detail_id: asset.collectionDetailId,
        deposit_status: "IN_TRANSIT",
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
        check_no: check.checkNo ?? `DEP-${check.collectionDetailId}`,
        check_date: check.chequeDate ?? input.depositDate,
        amount: check.amount,
        drawee_bank: check.bankName,
        payor: check.customer,
        status: "IN_CLEARING",
        is_pdc: 0,
        source_type: "COLLECTIONS",
        source_ref: depositNo,
        collection_detail_id: check.collectionDetailId,
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
