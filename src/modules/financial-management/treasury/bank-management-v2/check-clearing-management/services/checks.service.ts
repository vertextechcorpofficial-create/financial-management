import "server-only";

import { CHECK_CANCEL_REASONS, CHECK_RETURN_REASONS, CHECK_STATUS_LABELS, STALE_CHECK_DAYS } from "../constants";
import type { PayableKey } from "../constants";
import { issuedCheckEntry, receivedCheckEntry } from "../events";
import { daysSince, phtStamp, phtToday, toPhtDateString } from "../pht";
import type {
  BankCheck,
  CheckDirection,
  CheckEvent,
  CheckStatus,
  CheckbookSeries,
  JournalEntryDraft,
} from "../types";
import {
  DirectusError,
  asBoolean,
  asNumber,
  asString,
  createItem,
  directusFetch,
  getItem,
  listItems,
  roundMoney,
  updateItem,
} from "./directus";
import { PostingBlockedError, postJournalEntry, resolveJournalEntry } from "./gl.service";

/**
 * Check & Clearing management: issuing, receiving and the clearing trail.
 *
 * `bank_checks`, `bank_check_events` and `bank_checkbooks` come from DDL the owner runs
 * separately, so every read tolerates the tables being absent and reports a notice
 * instead of failing the screen. Fields are always enumerated: this instance rejects
 * `fields=*`.
 */

const CHECKS = "bank_checks";
const EVENTS = "bank_check_events";
const CHECKBOOKS = "bank_checkbooks";
const ACCOUNTS = "bank_accounts";
const JOURNALS = "bank_journal_entries";

const NOTICE_REGISTER = "The check register table has not been created yet.";
const NOTICE_CHECKBOOKS = "The checkbook series table has not been created yet.";

const CHECK_FIELDS = [
  "id",
  "bank_account_id",
  "direction",
  "check_no",
  "check_date",
  "amount",
  "drawee_bank",
  "payee",
  "payor",
  "control_key",
  "status",
  "is_pdc",
  "return_reason",
  "released_at",
  "deposited_at",
  "cleared_at",
  "returned_at",
  "replaced_by_id",
  "replaces_id",
  "source_type",
  "source_ref",
  "remarks",
  "created_at",
];

const EVENT_FIELDS = [
  "id",
  "check_id",
  "action",
  "from_status",
  "to_status",
  "event_code",
  "journal_entry_id",
  "note",
  "occurred_at",
  "actor_id",
];

const CHECKBOOK_FIELDS = [
  "id",
  "bank_account_id",
  "series_start",
  "series_end",
  "next_no",
  "is_active",
  "created_at",
];

const ACCOUNT_FIELDS = ["bank_id", "bank_name", "account_number", "gl_coa_id"];

/** Display labels exactly as the spec's rejection strings spell them. */
const SPEC_STATUS_LABELS: Record<CheckStatus, string> = {
  PENDING: "Pending",
  RECEIVED: "Received",
  IN_CLEARING: "In Clearing",
  CLEARED: "Cleared",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
};

/** E09 debits the payee's control account: an issued check settles a payable (P44/P156). */
const ISSUED_COUNTER_KEY = "AP_CONTROL";

/** P44/P156/P181: an issued check's payable side is AP-CTL or NTP-CTL, chosen at issue. */
const PAYABLE_KEYS: readonly PayableKey[] = ["AP_CONTROL", "NTP_CONTROL"];

/** Rows issued before the choice existed carry no control_key; they all posted to AP-CTL. */
function payableKeyFor(row: { control_key: string | null }): PayableKey {
  return row.control_key === "NTP_CONTROL" ? "NTP_CONTROL" : ISSUED_COUNTER_KEY;
}

const CHECK_STATUSES = Object.keys(CHECK_STATUS_LABELS) as CheckStatus[];

type CheckRow = {
  id: number;
  bank_account_id: number | null;
  direction: string | null;
  check_no: string | null;
  check_date: string | null;
  amount: number | string | null;
  drawee_bank: string | null;
  payee: string | null;
  payor: string | null;
  control_key: string | null;
  status: string | null;
  is_pdc: unknown;
  return_reason: string | null;
  released_at: string | null;
  deposited_at: string | null;
  cleared_at: string | null;
  returned_at: string | null;
  replaced_by_id: number | null;
  replaces_id: number | null;
  source_type: string | null;
  source_ref: string | null;
  remarks: string | null;
  created_at: string | null;
};

type EventRow = {
  id: number;
  check_id: number | null;
  action: string | null;
  from_status: string | null;
  to_status: string | null;
  event_code: string | null;
  journal_entry_id: number | null;
  note: string | null;
  occurred_at: string | null;
  actor_id: number | null;
};

type UserRow = {
  user_id: number;
  user_fname: string | null;
  user_mname: string | null;
  user_lname: string | null;
  user_email: string | null;
};

/**
 * P101 wants a person on every history line. `bank_check_events.actor_id` holds a
 * `user.user_id`; the name has to be resolved here because the static token cannot read
 * the columns from the browser (same shape as bank-deposit's `loadPreparers`).
 */
async function loadActors(ids: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  if (!unique.length) return new Map();
  try {
    const { rows } = await listItems<UserRow>("user", {
      fields: ["user_id", "user_fname", "user_mname", "user_lname", "user_email"],
      filter: { user_id: { _in: unique } },
      limit: 200,
    });
    return new Map(
      rows.map((row) => {
        const name = [row.user_fname, row.user_mname, row.user_lname]
          .map((part) => asString(part).trim())
          .filter(Boolean)
          .join(" ");
        return [Number(row.user_id), name || asString(row.user_email) || "—"];
      }),
    );
  } catch (error) {
    // The user table belongs to another module; a missing read must not blank the trail.
    if (error instanceof DirectusError) return new Map();
    throw error;
  }
}

type CheckbookRow = {
  id: number;
  bank_account_id: number | null;
  series_start: string | null;
  series_end: string | null;
  next_no: string | null;
  is_active: unknown;
  created_at: string | null;
};

type AccountRow = {
  bank_id: number;
  bank_name: string | null;
  account_number: string | null;
  gl_coa_id: number | null;
};

/**
 * The bank leg of E10/E13/E15 resolves through the account's linked GL when it has one,
 * so the bank balance moves on the real 102100 row rather than the CASH_IN_BANK fallback.
 */
async function accountRef(bankAccountId: number): Promise<{ bankId: number; glCoaId: number | null }> {
  try {
    const row = await getItem<AccountRow>(ACCOUNTS, bankAccountId, ACCOUNT_FIELDS);
    return { bankId: bankAccountId, glCoaId: row?.gl_coa_id == null ? null : Number(row.gl_coa_id) };
  } catch (error) {
    if (error instanceof DirectusError) return { bankId: bankAccountId, glCoaId: null };
    throw error;
  }
}

export type CheckAction = "RELEASE" | "DEPOSIT" | "CLEAR" | "RETURN" | "CANCEL" | "REPLACE";

export type CheckWriteResult = {
  check: BankCheck;
};

export type CheckRegisterFlag = "PDC" | "STALE" | "NOREPL" | "REPL";

export type CheckRegisterFilter = {
  direction?: CheckDirection;
  status?: CheckStatus;
  accountId?: number;
  bankName?: string;
  flag?: CheckRegisterFlag;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

export type CheckRegisterResult = {
  checks: BankCheck[];
  counts: Record<CheckStatus, number>;
  accounts: { bankId: number; label: string; bankName: string; accountNumber: string | null }[];
  /** Rows matching the filters before paging, so the pager can size itself without pulling them. */
  total: number;
  page: number;
  pageSize: number;
  notice?: string;
};

export type CheckDetail = { check: BankCheck; events: CheckEvent[] };

export type CheckbookListResult = { series: CheckbookSeries[]; notice?: string };

export type IssueCheckInput = {
  bankAccountId: number;
  checkDate: string;
  amount: number;
  payee: string;
  remarks: string | null;
  /** P44: AP-CTL or NTP-CTL. Absent on legacy callers, which get AP-CTL. */
  controlKey?: string | null;
};

export type ReceiveCheckInput = {
  bankAccountId: number;
  checkNo: string;
  checkDate: string;
  amount: number;
  draweeBank: string | null;
  payor: string | null;
  remarks: string | null;
};

export type ReplacementCheckType = "PDC" | "DATED" | "MANAGERS_CHECK";

export type ReplacementInput = {
  checkDate: string;
  amount: number;
  checkNo: string;
  /** Received replacements only: the new check's drawee bank. Falls back to the old check's. */
  draweeBank?: string | null;
  /** Classification of the replacement itself, so a dated check cannot be recorded as post-dated. */
  checkType: ReplacementCheckType;
};

export type CheckActionInput = {
  action: CheckAction;
  returnReason?: string | null;
  cancelReason?: string | null;
  note?: string | null;
  replacement?: ReplacementInput | null;
  /** Release date (4.3), deposit date (4.4) and clearing date (4.5). Default to today. */
  releaseDate?: string | null;
  depositDate?: string | null;
  clearedDate?: string | null;
};

export type CreateCheckbookInput = {
  bankAccountId: number;
  seriesStart: string;
  seriesEnd: string;
};

export class ValidationError extends Error {
  field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

/** A state conflict with the register: wrong status for the action, duplicate number, exhausted series. */
export class ConflictError extends Error {
  field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "ConflictError";
    this.field = field;
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export type CheckErrorBody = {
  success: false;
  error: string;
  fieldErrors?: Record<string, string[]>;
  missingMappingKeys?: string[];
};

/** True for a real "YYYY-MM-DD" day; JS Date.parse would happily roll 2026-02-31 into March. */
export function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Maps a thrown error onto the API envelope. Logs every failure that is not a
 * caller mistake, so a 5xx never reaches the client without a server-side trace.
 */
export function describeCheckError(error: unknown, context: string): { status: number; body: CheckErrorBody } {
  if (error instanceof ConflictError) {
    console.error(context, error);
    return {
      status: 409,
      body: { success: false, error: error.message, ...(error.field ? { fieldErrors: { [error.field]: [error.message] } } : {}) },
    };
  }
  if (error instanceof NotFoundError) {
    console.error(context, error);
    return { status: 404, body: { success: false, error: error.message } };
  }
  if (error instanceof ValidationError) {
    return {
      status: 400,
      body: { success: false, error: error.message, ...(error.field ? { fieldErrors: { [error.field]: [error.message] } } : {}) },
    };
  }
  console.error(context, error);
  if (error instanceof DirectusError) {
    // The path is the only thing that makes a 502 diagnosable, and it names no customer data.
    const where = error.message.match(/on (\S+)/)?.[1];
    // The platform's own sentence names the column it refused; without it a 502 is a dead end.
    const why = error.body.replace(/\s+/g, " ").slice(0, 200);
    return {
      status: 502,
      body: {
        success: false,
        error: where
          ? `The banking instance rejected the request (${where}): ${why}`
          : `The banking instance rejected the request: ${why}`,
      },
    };
  }
  return { status: 500, body: { success: false, error: "The request could not be completed." } };
}

function accountLabel(row: AccountRow): string {
  return [row.bank_name, row.account_number].filter(Boolean).join(" · ") || `Account ${row.bank_id}`;
}

/** The label's two halves: the account number identifies the account, the bank names it. */
function accountParts(rows: AccountRow[]): Map<number, { number: string | null; bank: string | null }> {
  return new Map(
    rows.map((row) => [
      Number(row.bank_id),
      { number: asString(row.account_number) || null, bank: asString(row.bank_name) || null },
    ]),
  );
}

async function accountLabelMap(
  ids?: number[],
): Promise<{ labels: Map<number, string>; parts: Map<number, { number: string | null; bank: string | null }> }> {
  const filter = ids && ids.length ? { bank_id: { _in: ids } } : undefined;
  const { rows } = await listItems<AccountRow>(ACCOUNTS, { fields: ACCOUNT_FIELDS, filter, limit: 500 });
  return { labels: new Map(rows.map((row) => [Number(row.bank_id), accountLabel(row)])), parts: accountParts(rows) };
}

async function accountLabels(ids?: number[]): Promise<Map<number, string>> {
  return (await accountLabelMap(ids)).labels;
}

async function listActiveAccounts(): Promise<
  { bankId: number; label: string; bankName: string; accountNumber: string | null }[]
> {
  const { rows } = await listItems<AccountRow>(ACCOUNTS, {
    fields: ACCOUNT_FIELDS,
    filter: { is_active: { _eq: true }, account_status: { _eq: "ACTIVE" } },
    sort: "bank_name",
    limit: 500,
  });
  return rows.map((row) => ({
    bankId: Number(row.bank_id),
    label: accountLabel(row),
    bankName: asString(row.bank_name) || "Bank account",
    accountNumber: asString(row.account_number) || null,
  }));
}

function checkStatus(value: unknown): CheckStatus {
  const status = asString(value).toUpperCase();
  return CHECK_STATUSES.find((candidate) => candidate === status) ?? "PENDING";
}

function checkDirection(value: unknown): CheckDirection {
  return asString(value).toUpperCase() === "RECEIVED" ? "RECEIVED" : "ISSUED";
}

function sourceType(value: unknown): BankCheck["sourceType"] {
  const type = asString(value).toUpperCase();
  return type === "COLLECTIONS" || type === "DISBURSEMENT" || type === "REPLACEMENT" ? type : "MANUAL";
}

type AccountParts = Map<number, { number: string | null; bank: string | null }>;

function toCheck(
  row: CheckRow,
  labels: Map<number, string>,
  checkNos: Map<number, string> = new Map(),
  parts: AccountParts = new Map(),
): BankCheck {
  const status = checkStatus(row.status);
  const ageDays = daysSince(row.check_date);
  return {
    id: Number(row.id),
    bankAccountId: Number(row.bank_account_id ?? 0),
    bankAccountLabel: labels.get(Number(row.bank_account_id)) ?? "—",
    bankAccountNumber: parts.get(Number(row.bank_account_id))?.number ?? null,
    bankAccountBank: parts.get(Number(row.bank_account_id))?.bank ?? null,
    direction: checkDirection(row.direction),
    checkNo: asString(row.check_no),
    checkDate: toPhtDateString(row.check_date),
    amount: roundMoney(asNumber(row.amount)),
    draweeBank: row.drawee_bank,
    payee: row.payee,
    payor: row.payor,
    controlKey: row.control_key,
    status,
    // Spec 2: both flags are computed, never read from storage. `is_pdc` is still written for
    // older readers, but the register only trusts checkDate against today.
    isPdc:
      (status === "PENDING" || status === "RECEIVED" || status === "IN_CLEARING") &&
      toPhtDateString(row.check_date) > phtToday(),
    returnReason: row.return_reason,
    releasedAt: row.released_at ? toPhtDateString(row.released_at) : null,
    depositedAt: row.deposited_at ? toPhtDateString(row.deposited_at) : null,
    clearedAt: row.cleared_at ? toPhtDateString(row.cleared_at) : null,
    returnedAt: row.returned_at ? toPhtDateString(row.returned_at) : null,
    replacedById: row.replaced_by_id == null ? null : Number(row.replaced_by_id),
    replacesId: row.replaces_id == null ? null : Number(row.replaces_id),
    replacedByNo: row.replaced_by_id == null ? null : (checkNos.get(Number(row.replaced_by_id)) ?? null),
    replacesNo: row.replaces_id == null ? null : (checkNos.get(Number(row.replaces_id)) ?? null),
    sourceType: sourceType(row.source_type),
    sourceRef: row.source_ref,
    remarks: row.remarks,
    createdAt: toPhtDateString(row.created_at),
    ageDays,
    // Spec 2: stale is an issued check only — a received check has no 180-day clock.
    isStale:
      checkDirection(row.direction) === "ISSUED" &&
      (status === "PENDING" || status === "IN_CLEARING") &&
      ageDays > STALE_CHECK_DAYS,
  };
}

function toSeries(row: CheckbookRow, labels: Map<number, string>): CheckbookSeries {
  const nextNo = asString(row.next_no);
  return {
    id: Number(row.id),
    bankAccountId: Number(row.bank_account_id ?? 0),
    bankAccountLabel: labels.get(Number(row.bank_account_id)) ?? "—",
    seriesStart: asString(row.series_start),
    seriesEnd: asString(row.series_end),
    nextNo: nextNo || null,
    isActive: asBoolean(row.is_active),
    createdAt: toPhtDateString(row.created_at),
  };
}

function emptyCounts(): Record<CheckStatus, number> {
  return Object.fromEntries(CHECK_STATUSES.map((status) => [status, 0])) as Record<CheckStatus, number>;
}

/** Totals over the whole register, independent of the list filters. */
async function countByStatus(): Promise<Record<CheckStatus, number>> {
  const entries = await Promise.all(
    CHECK_STATUSES.map(async (status) => {
      const { total } = await listItems<{ id: number }>(CHECKS, {
        fields: ["id"],
        filter: { status: { _eq: status } },
        limit: 1,
      });
      return [status, total] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<CheckStatus, number>;
}

/** Statuses that mean a cheque is still moving: not settled, not dead. */
const OPEN_STATUSES = ["PENDING", "RECEIVED", "IN_CLEARING"] as const;
async function listFilteredChecks(
  input: CheckRegisterFilter,
  accounts: { bankId: number; bankName: string }[],
  page: number,
  pageSize: number,
): Promise<{ rows: CheckRow[]; total: number }> {
  const filter: Record<string, unknown> = {};
  if (input.direction) filter.direction = { _eq: input.direction };
  if (input.status) filter.status = { _eq: input.status };
  if (input.accountId) filter.bank_account_id = { _eq: input.accountId };

  if (input.bankName) {
    const ids = accounts.filter((account) => account.bankName === input.bankName).map((account) => account.bankId);
    filter.bank_account_id = { _in: ids.length ? ids : [-1] };
  }

  if (input.dateFrom || input.dateTo) {
    const range: Record<string, string> = {};
    if (input.dateFrom) range._gte = input.dateFrom;
    if (input.dateTo) range._lte = input.dateTo;
    filter.check_date = range;
  }

  const q = asString(input.q);
  if (q) {
    filter._or = [
      { check_no: { _icontains: q } },
      { payee: { _icontains: q } },
      { payor: { _icontains: q } },
      { drawee_bank: { _icontains: q } },
    ];
  }

  // Every cheque comes back: the register pages and filters in memory, so a cap here silently hides
  // rows instead of paging them. Batches keep one request from carrying the whole table.
  // Every flag is expressible in the platform filter, so paging happens in the database rather than
  // in memory: a 10,000-row register costs one page, not the whole table.
  const today = phtToday();
  const staleBefore = toPhtDateString(new Date(Date.parse(`${today}T00:00:00Z`) - STALE_CHECK_DAYS * 86_400_000));
  if (input.flag === "PDC") {
    filter.status = { _in: OPEN_STATUSES };
    filter.check_date = { _gt: today };
  } else if (input.flag === "STALE") {
    filter.direction = { _eq: "ISSUED" };
    filter.status = { _in: ["PENDING", "IN_CLEARING"] };
    filter.check_date = { _lt: staleBefore };
  } else if (input.flag === "NOREPL") {
    filter.status = { _in: ["RETURNED", "CANCELLED"] };
    filter.replaced_by_id = { _null: true };
  } else if (input.flag === "REPL") {
    filter._or = [{ replaces_id: { _nnull: true } }, { replaced_by_id: { _nnull: true } }];
  }

  return listItems<CheckRow>(CHECKS, {
    fields: CHECK_FIELDS,
    filter: Object.keys(filter).length ? filter : undefined,
    sort: "-id",
    limit: pageSize,
    page,
  });
}

export async function listCheckRegister(input: CheckRegisterFilter = {}): Promise<CheckRegisterResult> {
  const accounts = await listActiveAccounts();
  const labels = new Map(accounts.map((account) => [account.bankId, account.label]));

  const page = Math.max(1, Math.trunc(input.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.trunc(input.pageSize ?? 10)));

  let rows: CheckRow[] = [];
  let total = 0;
  let counts = emptyCounts();
  let notice: string | undefined;

  try {
    const [current, statusCounts] = await Promise.all([
      listFilteredChecks(input, accounts, page, pageSize),
      countByStatus(),
    ]);
    rows = current.rows;
    total = current.total;
    counts = statusCounts;
  } catch (error) {
    if (!(error instanceof DirectusError)) throw error;
    notice = NOTICE_REGISTER;
  }

  const checkNos = await relatedCheckNumbers(rows);

  const parts: AccountParts = new Map(
    accounts.map((account) => [account.bankId, { number: account.accountNumber, bank: account.bankName }]),
  );

  return {
    checks: rows.map((row) => toCheck(row, labels, checkNos, parts)),
    counts,
    accounts,
    total,
    page,
    pageSize,
    ...(notice ? { notice } : {}),
  };
}

/**
 * Check numbers for the replacement links on the current page.
 * The register shows "Replaced by <check no>", and a bare id is unreadable there.
 */
async function relatedCheckNumbers(rows: CheckRow[]): Promise<Map<number, string>> {
  const ids = [
    ...new Set(
      rows
        .flatMap((row) => [Number(row.replaces_id ?? 0), Number(row.replaced_by_id ?? 0)])
        .filter((id) => id > 0),
    ),
  ];
  if (!ids.length) return new Map();

  try {
    const { rows: related } = await listItems<{ id: number; check_no: string }>(CHECKS, {
      fields: ["id", "check_no"],
      filter: { id: { _in: ids } },
      limit: ids.length,
    });
    return new Map(related.map((row) => [Number(row.id), asString(row.check_no)]));
  } catch (error) {
    // The numbers are labels; the row dialog still resolves the related check by id.
    if (error instanceof DirectusError) return new Map();
    throw error;
  }
}

async function listEvents(checkId: number): Promise<CheckEvent[]> {
  let rows: EventRow[];
  try {
    ({ rows } = await listItems<EventRow>(EVENTS, {
      fields: EVENT_FIELDS,
      filter: { check_id: { _eq: checkId } },
      sort: "-id",
      limit: 200,
    }));
  } catch (error) {
    // Traffic in the register keeps working while the trail table is still missing.
    if (error instanceof DirectusError) return [];
    throw error;
  }

  if (!rows.length) return [];

  const jeIds = [...new Set(rows.map((row) => Number(row.journal_entry_id ?? 0)).filter((id) => id > 0))];
  const jeNos = new Map<number, string>();
  if (jeIds.length) {
    try {
      const { rows: entries } = await listItems<{ id: number; je_no: string }>(JOURNALS, {
        fields: ["id", "je_no"],
        filter: { id: { _in: jeIds } },
        limit: 200,
      });
      for (const entry of entries) jeNos.set(Number(entry.id), entry.je_no);
    } catch (error) {
      if (!(error instanceof DirectusError)) throw error;
    }
  }

  const actors = await loadActors(rows.map((row) => Number(row.actor_id ?? 0)));

  return rows.map((row) => ({
    id: Number(row.id),
    checkId: Number(row.check_id ?? 0),
    action: asString(row.action),
    fromStatus: row.from_status,
    toStatus: row.to_status,
    eventCode: row.event_code,
    journalNo: row.journal_entry_id == null ? null : jeNos.get(Number(row.journal_entry_id)) ?? null,
    note: row.note,
    actorName: row.actor_id == null ? null : actors.get(Number(row.actor_id)) ?? null,
    occurredAt: toPhtDateString(row.occurred_at),
  }));
}

async function loadCheckRow(checkId: number): Promise<CheckRow> {
  let row: CheckRow | null;
  try {
    row = await getItem<CheckRow>(CHECKS, checkId, CHECK_FIELDS);
  } catch (error) {
    if (error instanceof DirectusError) {
      throw new NotFoundError("This check could not be read. The check register table may not be available yet.");
    }
    throw error;
  }
  if (!row) throw new NotFoundError("Check not found.");
  return row;
}

async function reloadCheck(checkId: number): Promise<BankCheck> {
  let row: CheckRow | null = null;
  try {
    row = await getItem<CheckRow>(CHECKS, checkId, CHECK_FIELDS);
  } catch (error) {
    if (!(error instanceof DirectusError)) throw error;
  }
  if (!row) throw new NotFoundError("The check was saved but could not be read back.");
  const accountId = Number(row.bank_account_id ?? 0);
  return toCheck(row, await accountLabels(accountId ? [accountId] : undefined));
}

export async function getCheckDetail(checkId: number): Promise<CheckDetail> {
  const row = await loadCheckRow(checkId);
  const accountId = Number(row.bank_account_id ?? 0);
  const [labels, events] = await Promise.all([
    accountLabels(accountId ? [accountId] : undefined),
    listEvents(checkId),
  ]);
  return { check: toCheck(row, labels), events };
}

type PostResult = { journalEntryId: number };

/**
 * A check is only as good as its entry: when the mapping is incomplete this throws, and
 * the caller writes nothing. Task 33 item 1 — a Cleared check with no entry is a lie.
 */
async function postCheckEntry(draft: JournalEntryDraft): Promise<PostResult> {
  try {
    const posted = await postJournalEntry(draft, null);
    return { journalEntryId: posted.id };
  } catch (error) {
    if (error instanceof PostingBlockedError) {
      const keys = error.missingMappingKeys;
      throw new ConflictError(
        keys.length > 0
          ? `Ask accounting to map ${keys.join(", ")} before this check can be posted.`
          : error.message,
        "action",
      );
    }
    throw error;
  }
}

/**
 * Posts the entry for a check row that was just created. If the mapping refuses it the
 * row is deleted again: a check without its entry must not survive (task 33 item 1).
 */
async function postCheckEntryOrDiscard(createdId: number, draft: JournalEntryDraft): Promise<PostResult> {
  try {
    return await postCheckEntry(draft);
  } catch (error) {
    await directusFetch(`/items/${CHECKS}/${createdId}`, { method: "DELETE" }).catch(() => undefined);
    throw error;
  }
}

type AppendEventInput = {
  checkId: number;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  eventCode: string | null;
  journalEntryId: number | null;
  note: string | null;
  actorId: number | null;
};

async function appendEvent(input: AppendEventInput): Promise<void> {
  try {
    await createItem(EVENTS, {
      check_id: input.checkId,
      action: input.action,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      event_code: input.eventCode,
      journal_entry_id: input.journalEntryId,
      note: input.note,
      actor_id: input.actorId,
      occurred_at: phtStamp(),
    });
  } catch (error) {
    // The check row is the record of the check; a missing trail table must not undo a
    // write that already happened.
    if (!(error instanceof DirectusError)) throw error;
  }
}

function draftBase(sourceRef: string, postingDate: string, description: string) {
  return { sourceRef, postingDate, description };
}

/**
 * The CLEAR entry for a row (spec table 4, E10 issued / E13 received). Shared by the single
 * action and the batch pre-pass so both resolve the same mapping keys.
 */
function clearDraft(
  row: CheckRow,
  account: { bankId: number; glCoaId: number | null },
  checkNo: string,
  amount: number,
  clearedDate: string,
): JournalEntryDraft {
  const base = draftBase(checkNo, clearedDate, `Check ${checkNo} cleared`);
  return checkDirection(row.direction) === "ISSUED"
    ? issuedCheckEntry("E10", account, amount, payableKeyFor(row), base)
    : receivedCheckEntry("E13", account, amount, base);
}

/** Spec 4: every action date is a real calendar date and never in the future. */
function actionDate(value: string | null | undefined, field: string, what: string): string {
  const date = asString(value) || phtToday();
  if (!isCalendarDate(date)) throw new ValidationError(`Enter a valid ${what}.`, field);
  if (date > phtToday()) throw new ValidationError(`The ${what} cannot be in the future.`, field);
  return date;
}

/** Numeric value of a series number: "0001234" and "1234" compare equal. */
function numericSeriesValue(value: string | null | undefined): number {
  const digits = asString(value).replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

function formatSeriesNo(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** Next unused leaf of the account's active checkbook series. */
async function allocateCheckNo(accountId: number): Promise<string> {
  const { rows: series } = await listItems<CheckbookRow>(CHECKBOOKS, {
    fields: CHECKBOOK_FIELDS,
    filter: { bank_account_id: { _eq: accountId }, is_active: { _eq: true } },
    sort: "series_start",
    limit: 50,
  });

  if (!series.length) {
    const labels = await accountLabels([accountId]);
    throw new ConflictError(
      `No checkbook series with unused leaves is registered for ${labels.get(accountId) ?? "this account"}.`,
    );
  }

  const { rows: issued } = await listItems<{ check_no: string | null }>(CHECKS, {
    fields: ["check_no"],
    filter: { bank_account_id: { _eq: accountId }, direction: { _eq: "ISSUED" } },
    limit: 1000,
  });
  const used = new Set(issued.map((row) => numericSeriesValue(row.check_no)));

  for (const book of series) {
    const start = numericSeriesValue(book.series_start);
    const end = numericSeriesValue(book.series_end);
    const width = asString(book.series_start).replace(/\D/g, "").length || 1;
    const storedNext = asString(book.next_no);

    let candidate = storedNext ? numericSeriesValue(storedNext) : start;
    while (candidate <= end && used.has(candidate)) candidate += 1;
    if (candidate > end) continue;

    await updateItem(CHECKBOOKS, book.id, { next_no: formatSeriesNo(candidate + 1, width) });
    return formatSeriesNo(candidate, width);
  }

  const labels = await accountLabels([accountId]);
  throw new ConflictError(
    `No checkbook series with unused leaves is registered for ${labels.get(accountId) ?? "this account"}.`,
  );
}

export async function issueCheck(input: IssueCheckInput, actorId: number | null): Promise<CheckWriteResult> {
  const amount = roundMoney(input.amount);
  // P44: the payable account is part of the issue form, not a constant.
  const controlKey: PayableKey =
    input.controlKey == null || input.controlKey === "" ? ISSUED_COUNTER_KEY : (input.controlKey as PayableKey);
  if (!PAYABLE_KEYS.includes(controlKey)) {
    throw new ValidationError("Choose AP-CTL or NTP-CTL as the payable account.", "controlKey");
  }
  const checkNo = await allocateCheckNo(input.bankAccountId);
  const account = await accountRef(input.bankAccountId);
  const postDated = input.checkDate > phtToday();

  // P51/P109: check no. + bank account is the key for issued checks.
  const label = (await accountLabels([input.bankAccountId])).get(input.bankAccountId) ?? "this account";
  const { rows: duplicates } = await listItems<{ id: number }>(CHECKS, {
    fields: ["id"],
    filter: {
      direction: { _eq: "ISSUED" },
      check_no: { _eq: checkNo },
      bank_account_id: { _eq: input.bankAccountId },
    },
    limit: 1,
  });
  if (duplicates.length) {
    throw new ConflictError(`Check ${checkNo} from ${label} is already recorded.`, "checkNo");
  }

  const created = await createItem<{ id: number }>(CHECKS, {
    bank_account_id: input.bankAccountId,
    direction: "ISSUED",
    check_no: checkNo,
    check_date: input.checkDate,
    amount,
    payee: input.payee,
    status: "PENDING",
    is_pdc: postDated ? 1 : 0,
    control_key: controlKey,
    source_type: "MANUAL",
    remarks: input.remarks,
    created_at: phtStamp(),
  });

  const posting = await postCheckEntryOrDiscard(
    Number(created.id),
    issuedCheckEntry("E09", account, amount, controlKey, draftBase(
      checkNo,
      input.checkDate,
      `Check ${checkNo} issued to ${input.payee}`,
    )),
  );

  await appendEvent({
    checkId: Number(created.id),
    action: "ISSUE",
    fromStatus: null,
    toStatus: "PENDING",
    eventCode: "E09",
    journalEntryId: posting.journalEntryId,
    note: `Check issued to ${input.payee}${postDated ? ` (post-dated ${input.checkDate})` : ""}`,
    actorId,
  });

  return { check: await reloadCheck(Number(created.id)) };
}

export async function receiveCheck(
  input: ReceiveCheckInput,
  actorId: number | null,
): Promise<CheckWriteResult> {
  const amount = roundMoney(input.amount);
  const checkNo = asString(input.checkNo).replace(/\D/g, "");
  if (checkNo.length < 4) {
    throw new ValidationError("The check number needs at least four digits.", "checkNo");
  }
  const draweeBank = asString(input.draweeBank) || null;
  const account = await accountRef(input.bankAccountId);
  const postDated = input.checkDate > phtToday();

  // Spec 4.2: for received checks the number is unique per drawee bank, not per our account.
  const duplicateFilter: Record<string, unknown> = {
    direction: { _eq: "RECEIVED" },
    check_no: { _eq: checkNo },
  };
  if (draweeBank) duplicateFilter.drawee_bank = { _eq: draweeBank };
  const { rows: duplicates } = await listItems<{ id: number }>(CHECKS, {
    fields: ["id"],
    filter: duplicateFilter,
    limit: 1,
  });
  if (duplicates.length) {
    const from = draweeBank ?? (await accountLabels([input.bankAccountId])).get(input.bankAccountId) ?? "that bank";
    throw new ConflictError(`Check ${checkNo} from ${from} is already recorded.`, "checkNo");
  }

  const created = await createItem<{ id: number }>(CHECKS, {
    bank_account_id: input.bankAccountId,
    direction: "RECEIVED",
    check_no: checkNo,
    check_date: input.checkDate,
    amount,
    drawee_bank: draweeBank,
    payor: input.payor,
    status: "RECEIVED",
    is_pdc: postDated ? 1 : 0,
    source_type: "MANUAL",
    remarks: input.remarks,
    created_at: phtStamp(),
  });

  const posting = await postCheckEntryOrDiscard(
    Number(created.id),
    receivedCheckEntry("E12", account, amount, draftBase(
      checkNo,
      input.checkDate,
      `Check ${checkNo} received${input.payor ? ` from ${input.payor}` : ""}`,
    )),
  );

  await appendEvent({
    checkId: Number(created.id),
    action: "RECEIVE",
    fromStatus: null,
    toStatus: "RECEIVED",
    eventCode: "E12",
    journalEntryId: posting.journalEntryId,
    note: `Check received${input.payor ? ` from ${input.payor}` : ""}${postDated ? ` (post-dated ${input.checkDate})` : ""}`,
    actorId,
  });

  return { check: await reloadCheck(Number(created.id)) };
}

export async function applyCheckAction(
  checkId: number,
  input: CheckActionInput,
  actorId: number | null,
): Promise<CheckWriteResult> {
  const row = await loadCheckRow(checkId);
  const status = checkStatus(row.status);
  const direction = checkDirection(row.direction);
  const amount = roundMoney(asNumber(row.amount));
  const checkNo = asString(row.check_no);
  const checkDate = toPhtDateString(row.check_date);
  const bankAccountId = Number(row.bank_account_id ?? 0);
  const account = await accountRef(bankAccountId);
  const today = phtToday();
  const note = asString(input.note) || null;
  const label = SPEC_STATUS_LABELS[status];

  if (input.action === "RELEASE") {
    if (direction !== "ISSUED" || status !== "PENDING") {
      throw new ConflictError(`Check ${checkNo} is ${label}. Only issued checks Pending can be released.`, "action");
    }
    // Spec 4.3: a PDC may be released — the payee just cannot encash it early.
    const releaseDate = actionDate(input.releaseDate, "releaseDate", "release date");

    await updateItem(CHECKS, checkId, { status: "IN_CLEARING", released_at: `${releaseDate}T00:00:00` });
    await appendEvent({
      checkId,
      action: "RELEASE",
      fromStatus: status,
      toStatus: "IN_CLEARING",
      eventCode: null,
      journalEntryId: null,
      note: `Released to payee on ${releaseDate}; awaiting encashment`,
      actorId,
    });
    return { check: await reloadCheck(checkId) };
  }

  if (input.action === "DEPOSIT") {
    if (direction !== "RECEIVED" || status !== "RECEIVED") {
      throw new ConflictError(`Check ${checkNo} is ${label}. Only received checks Received can be deposited.`, "action");
    }
    const depositDate = actionDate(input.depositDate, "depositDate", "deposit date");
    // Spec 4.4 / table 3: the deposit date is what blocks a PDC.
    if (depositDate < checkDate) {
      throw new ValidationError(`The deposit date cannot be before ${checkDate}.`, "depositDate");
    }

    await updateItem(CHECKS, checkId, { status: "IN_CLEARING", deposited_at: `${depositDate}T00:00:00` });
    await appendEvent({
      checkId,
      action: "DEPOSIT",
      fromStatus: status,
      toStatus: "IN_CLEARING",
      eventCode: null,
      journalEntryId: null,
      note: `Deposited on ${depositDate}; awaiting bank credit`,
      actorId,
    });
    return { check: await reloadCheck(checkId) };
  }

  if (input.action === "CLEAR") {
    // Spec table 2 rows 4 and 10: both directions clear only from In Clearing.
    if (status !== "IN_CLEARING") {
      throw new ConflictError(`Check ${checkNo} is ${label}. Only checks In Clearing can be cleared.`, "action");
    }

    const clearedDate = actionDate(input.clearedDate, "clearedDate", "clearing date");
    const sentDate = direction === "ISSUED" ? toPhtDateString(row.released_at) : toPhtDateString(row.deposited_at);
    if (clearedDate < checkDate) {
      throw new ValidationError(`The clearing date cannot be before the check date ${checkDate}.`, "clearedDate");
    }
    if (sentDate && clearedDate < sentDate) {
      throw new ValidationError(
        `The clearing date cannot be before the date the check was sent (${sentDate}).`,
        "clearedDate",
      );
    }

    const posting = await postCheckEntry(clearDraft(row, account, checkNo, amount, clearedDate));
    const eventCode = direction === "ISSUED" ? "E10" : "E13";

    await updateItem(CHECKS, checkId, { status: "CLEARED", cleared_at: `${clearedDate}T00:00:00` });
    await appendEvent({
      checkId,
      action: "CLEAR",
      fromStatus: status,
      toStatus: "CLEARED",
      eventCode,
      journalEntryId: posting.journalEntryId,
      note,
      actorId,
    });
    return { check: await reloadCheck(checkId) };
  }

  if (input.action === "RETURN") {
    const reason = asString(input.returnReason);
    if (!reason || !(CHECK_RETURN_REASONS as readonly string[]).includes(reason)) {
      throw new ValidationError("Pick a return reason from the list.", "returnReason");
    }
    if (reason === "Other" && !note) {
      throw new ValidationError("Describe the return reason in the note.", "note");
    }
    // Spec table 2 rows 5, 11, 12 and table 3.
    if (direction === "ISSUED" && status !== "IN_CLEARING") {
      throw new ConflictError(`Check ${checkNo} is ${label}; only issued checks In Clearing can be returned.`, "action");
    }
    if (direction === "RECEIVED" && status !== "IN_CLEARING" && status !== "CLEARED") {
      throw new ConflictError(
        `Check ${checkNo} is ${label}; only checks In Clearing or Cleared can be returned.`,
        "action",
      );
    }

    const eventCode: "E11" | "E14" | "E15" =
      direction === "ISSUED" ? "E11" : status === "CLEARED" ? "E15" : "E14";
    const description = `Check ${checkNo} returned — ${reason}`;
    const base = draftBase(`${checkNo}-RET`, today, description);
    const posting =
      eventCode === "E11"
        ? await postCheckEntry(issuedCheckEntry("E11", account, amount, payableKeyFor(row), base))
        : await postCheckEntry(receivedCheckEntry(eventCode, account, amount, base));

    await updateItem(CHECKS, checkId, {
      status: "RETURNED",
      returned_at: phtStamp(),
      return_reason: reason,
    });
    await appendEvent({
      checkId,
      action: "RETURN",
      fromStatus: status,
      toStatus: "RETURNED",
      eventCode,
      journalEntryId: posting.journalEntryId,
      note: `Returned: ${reason}`,
      actorId,
    });
    return { check: await reloadCheck(checkId) };
  }

  if (input.action === "CANCEL") {
    const reason = asString(input.cancelReason);
    if (!reason || !(CHECK_CANCEL_REASONS as readonly string[]).includes(reason)) {
      throw new ValidationError("Pick a cancel reason from the list.", "cancelReason");
    }
    if (reason === "Other" && !note) {
      throw new ValidationError("Describe the cancel reason in the note.", "note");
    }
    // Spec 4.7: issued Pending or In Clearing, received Received only.
    if (direction === "ISSUED") {
      if (status === "CLEARED") {
        throw new ConflictError(`Check ${checkNo} is Cleared and cannot be cancelled.`, "action");
      }
      if (status !== "PENDING" && status !== "IN_CLEARING") {
        throw new ConflictError(`Check ${checkNo} is ${label} and cannot be cancelled.`, "action");
      }
    } else if (status !== "RECEIVED") {
      if (status === "IN_CLEARING" || status === "CLEARED") {
        throw new ConflictError(
          `Check ${checkNo} is ${label}. Only checks not yet deposited can be cancelled; use Returned for a deposited check.`,
          "action",
        );
      }
      throw new ConflictError(`Check ${checkNo} is ${label} and cannot be cancelled.`, "action");
    }

    const description = `Check ${checkNo} cancelled — ${reason}`;
    const base = draftBase(`${checkNo}-CAN`, today, description);
    const posting =
      direction === "ISSUED"
        ? await postCheckEntry(issuedCheckEntry("E11", account, amount, payableKeyFor(row), base))
        : await postCheckEntry(receivedCheckEntry("E14", account, amount, base));

    await updateItem(CHECKS, checkId, { status: "CANCELLED", return_reason: reason });
    await appendEvent({
      checkId,
      action: "CANCEL",
      fromStatus: status,
      toStatus: "CANCELLED",
      eventCode: direction === "ISSUED" ? "E11" : "E14",
      journalEntryId: posting.journalEntryId,
      note: `Cancelled: ${reason}`,
      actorId,
    });
    return { check: await reloadCheck(checkId) };
  }

  if (status !== "RETURNED" && status !== "CANCELLED") {
    throw new ConflictError("Only Returned or Cancelled checks can be replaced.", "action");
  }
  const replacement = input.replacement;
  if (!replacement) {
    throw new ValidationError("Give the replacement check date and amount.", "replacement");
  }

  const replacementAmount = roundMoney(replacement.amount);
  if (!(replacementAmount > 0)) {
    throw new ValidationError("Enter an amount greater than zero.", "replacement.amount");
  }

  // Spec 4.8 / section 6: a check can be replaced once.
  if (row.replaced_by_id != null) {
    let replacedByNo = "";
    try {
      const next = await getItem<{ check_no: string | null }>(CHECKS, Number(row.replaced_by_id), ["check_no"]);
      replacedByNo = asString(next?.check_no);
    } catch (error) {
      if (!(error instanceof DirectusError)) throw error;
    }
    throw new ConflictError(
      `Check ${checkNo} was already replaced by ${replacedByNo || `check #${row.replaced_by_id}`}.`,
      "action",
    );
  }

  const providedNo = asString(replacement.checkNo);
  const replacementDrawee = asString(replacement.draweeBank) || asString(row.drawee_bank);
  if (direction === "RECEIVED" && !replacementDrawee) {
    throw new ValidationError("Choose the drawee bank on the replacement check.", "replacement.draweeBank");
  }
  if (!replacement.checkType) {
    throw new ValidationError("Choose what kind of check the replacement is.", "replacement.checkType");
  }
  let replacementNo: string;
  if (providedNo) {
    const { rows: duplicates } = await listItems<{ id: number }>(CHECKS, {
      fields: ["id"],
      filter: {
        bank_account_id: { _eq: bankAccountId },
        direction: { _eq: direction },
        check_no: { _eq: providedNo },
      },
      limit: 1,
    });
    if (duplicates.length) {
      const from = direction === "RECEIVED" && row.drawee_bank ? row.drawee_bank : (await accountLabels([bankAccountId])).get(bankAccountId) ?? "this account";
      throw new ConflictError(`Check ${providedNo} from ${from} is already recorded.`, "replacement.checkNo");
    }
    replacementNo = providedNo;
  } else if (direction === "ISSUED") {
    replacementNo = await allocateCheckNo(bankAccountId);
  } else {
    throw new ValidationError("Give the replacement check number.", "replacement.checkNo");
  }

  const draweeBank = direction === "RECEIVED" ? replacementDrawee : row.drawee_bank;
  const created = await createItem<{ id: number }>(CHECKS, {
    bank_account_id: bankAccountId,
    direction,
    check_no: replacementNo,
    check_date: replacement.checkDate,
    amount: replacementAmount,
    drawee_bank: draweeBank,
    payee: row.payee,
    payor: row.payor,
    status: direction === "ISSUED" ? "PENDING" : "RECEIVED",
    // The classification wins over the date: a manager's check drawn today is not a PDC,
    // and a post-dated replacement keeps `is_pdc` even when the date has since arrived.
    is_pdc: replacement.checkType === "PDC" ? 1 : 0,
    // Spec 4.8 / P82: a replacement keeps the old check's payable account.
    control_key: direction === "ISSUED" ? payableKeyFor(row) : null,
    source_type: "REPLACEMENT",
    source_ref: checkNo,
    replaces_id: checkId,
    remarks: note,
    created_at: phtStamp(),
  });

  // Spec 4.8: the new check posts E09 or E12; the old check's reversal was already posted.
  const newId = Number(created.id);
  const posting =
    direction === "ISSUED"
      ? await postCheckEntryOrDiscard(
          newId,
          issuedCheckEntry("E09", account, replacementAmount, payableKeyFor(row), draftBase(
            replacementNo,
            replacement.checkDate,
            `Replacement check ${replacementNo} issued for check ${checkNo}`,
          )),
        )
      : await postCheckEntryOrDiscard(
          newId,
          receivedCheckEntry("E12", account, replacementAmount, draftBase(
            replacementNo,
            replacement.checkDate,
            `Replacement check ${replacementNo} received for check ${checkNo}`,
          )),
        );

  await updateItem(CHECKS, checkId, { replaced_by_id: newId });
  const amountSuffix = replacementAmount === amount ? "" : ` (amount ${replacementAmount.toFixed(2)})`;
  await appendEvent({
    checkId,
    action: "REPLACE",
    fromStatus: status,
    toStatus: status,
    eventCode: null,
    journalEntryId: null,
    note: `Replaced by check ${replacementNo}${amountSuffix}`,
    actorId,
  });
  await appendEvent({
    checkId: newId,
    action: direction === "ISSUED" ? "ISSUE" : "RECEIVE",
    fromStatus: null,
    toStatus: direction === "ISSUED" ? "PENDING" : "RECEIVED",
    eventCode: direction === "ISSUED" ? "E09" : "E12",
    journalEntryId: posting.journalEntryId,
    note: `Replacement check ${direction === "ISSUED" ? "issued" : "received"} for check ${checkNo}`,
    actorId,
  });

  return { check: await reloadCheck(newId) };
}

export type ClearCheckEntry = { checkId: number; clearedDate: string };

export type ClearChecksResult = {
  cleared: BankCheck[];
  failures: { checkId: number; message: string }[];
};

/**
 * Batch clearing: one bank statement line per check, so each carries its own date.
 * Spec section 5: all-or-nothing. Every row is validated first — including the GL
 * mapping its CLEAR entry resolves — and nothing is written when any row fails.
 *
 * This is not a database transaction: a Directus or network error part-way through the
 * apply loop can still leave earlier rows committed. Only the causes we can check ahead
 * of time are made atomic.
 */
export async function clearChecks(
  entries: ClearCheckEntry[],
  actorId: number | null,
): Promise<ClearChecksResult> {
  const cleared: BankCheck[] = [];
  const failures: { checkId: number; message: string }[] = [];

  for (const entry of entries) {
    try {
      const row = await loadCheckRow(entry.checkId);
      if (row.status !== "IN_CLEARING") {
        throw new ConflictError(
          `Check ${asString(row.check_no)} is ${SPEC_STATUS_LABELS[row.status as CheckStatus]}. Only checks In Clearing can be cleared.`,
          "action",
        );
      }
      const checkDate = toPhtDateString(row.check_date);
      const clearedDate = actionDate(entry.clearedDate, "clearedDate", "clearing date");
      if (clearedDate < checkDate) {
        throw new ValidationError(`The clearing date cannot be before the check date ${checkDate}.`, "clearedDate");
      }
      const sentDate =
        row.direction === "ISSUED" ? toPhtDateString(row.released_at) : toPhtDateString(row.deposited_at);
      if (sentDate && clearedDate < sentDate) {
        throw new ValidationError(
          `The clearing date cannot be before the date the check was sent (${sentDate}).`,
          "clearedDate",
        );
      }

      const account = await accountRef(Number(row.bank_account_id));
      const { missingMappingKeys } = await resolveJournalEntry(
        clearDraft(row, account, asString(row.check_no), asNumber(row.amount), clearedDate),
      );
      if (missingMappingKeys.length > 0) {
        throw new ConflictError(
          `Ask accounting to map ${missingMappingKeys.join(", ")} before this check can be cleared.`,
          "action",
        );
      }
    } catch (error) {
      if (error instanceof ValidationError || error instanceof ConflictError) {
        failures.push({ checkId: entry.checkId, message: error.message });
        continue;
      }
      throw error;
    }
  }

  if (failures.length > 0) return { cleared: [], failures };

  for (const entry of entries) {
    const result = await applyCheckAction(entry.checkId, { action: "CLEAR", clearedDate: entry.clearedDate }, actorId);
    cleared.push(result.check);
  }

  return { cleared, failures };
}

export type BatchDateEntry = { checkId: number; date: string };

export type BatchActionResult = {
  checks: BankCheck[];
  failures: { checkId: number; message: string }[];
};

/**
 * Batch release and batch deposit (spec section 5). Neither posts a journal entry —
 * E09/E12 were posted when the check was issued or received — so the all-or-nothing
 * pre-pass only has to validate rows. Each applied row writes its own history line
 * through applyCheckAction.
 */
export async function batchReleaseOrDeposit(
  action: "RELEASE" | "DEPOSIT",
  entries: BatchDateEntry[],
  actorId: number | null,
): Promise<BatchActionResult> {
  const failures: { checkId: number; message: string }[] = [];
  const dateField = action === "RELEASE" ? "releaseDate" : "depositDate";
  const dateWhat = action === "RELEASE" ? "release date" : "deposit date";

  for (const entry of entries) {
    try {
      const row = await loadCheckRow(entry.checkId);
      const checkNo = asString(row.check_no);
      const label = SPEC_STATUS_LABELS[checkStatus(row.status)];
      const date = actionDate(entry.date, dateField, dateWhat);
      if (action === "RELEASE") {
        if (checkDirection(row.direction) !== "ISSUED" || row.status !== "PENDING") {
          throw new ConflictError(
            `Check ${checkNo} is ${label}; only issued Pending checks can be released.`,
            "action",
          );
        }
      } else {
        if (checkDirection(row.direction) !== "RECEIVED" || row.status !== "RECEIVED") {
          throw new ConflictError(
            `Check ${checkNo} is ${label}; only received checks that are Received can be deposited.`,
            "action",
          );
        }
        const checkDate = toPhtDateString(row.check_date);
        if (date < checkDate) {
          throw new ValidationError(`The deposit date cannot be before ${checkDate}.`, "depositDate");
        }
      }
    } catch (error) {
      if (error instanceof ValidationError || error instanceof ConflictError) {
        failures.push({ checkId: entry.checkId, message: error.message });
        continue;
      }
      throw error;
    }
  }

  if (failures.length > 0) return { checks: [], failures };

  const checks: BankCheck[] = [];
  for (const entry of entries) {
    const result = await applyCheckAction(
      entry.checkId,
      action === "RELEASE" ? { action: "RELEASE", releaseDate: entry.date } : { action: "DEPOSIT", depositDate: entry.date },
      actorId,
    );
    checks.push(result.check);
  }

  return { checks, failures };
}

export async function listCheckbooks(accountId?: number): Promise<CheckbookListResult> {
  let rows: CheckbookRow[];
  try {
    ({ rows } = await listItems<CheckbookRow>(CHECKBOOKS, {
      fields: CHECKBOOK_FIELDS,
      filter: accountId ? { bank_account_id: { _eq: accountId } } : undefined,
      sort: "series_start",
      limit: 200,
    }));
  } catch (error) {
    if (error instanceof DirectusError) return { series: [], notice: NOTICE_CHECKBOOKS };
    throw error;
  }

  const ids = [...new Set(rows.map((row) => Number(row.bank_account_id ?? 0)).filter((id) => id > 0))];
  const labels = await accountLabels(ids);
  return { series: rows.map((row) => toSeries(row, labels)) };
}

export async function createCheckbookSeries(input: CreateCheckbookInput): Promise<{ series: CheckbookSeries }> {
  const seriesStart = asString(input.seriesStart);
  const seriesEnd = asString(input.seriesEnd);
  const start = numericSeriesValue(seriesStart);
  const end = numericSeriesValue(seriesEnd);

  if (!start) throw new ValidationError("The series start must be a check number.", "seriesStart");
  if (!end) throw new ValidationError("The series end must be a check number.", "seriesEnd");
  if (end <= start) throw new ValidationError("The series end must be greater than the series start.", "seriesEnd");

  const { rows: existing } = await listItems<{ id: number; series_start: string | null; series_end: string | null }>(
    CHECKBOOKS,
    {
      fields: ["id", "series_start", "series_end"],
      filter: { bank_account_id: { _eq: input.bankAccountId } },
      limit: 500,
    },
  );

  const overlaps = existing.some((row) => {
    const otherStart = numericSeriesValue(row.series_start);
    const otherEnd = numericSeriesValue(row.series_end);
    return start <= otherEnd && end >= otherStart;
  });
  if (overlaps) throw new ConflictError("This series overlaps an existing checkbook.", "seriesStart");

  const created = await createItem<CheckbookRow>(CHECKBOOKS, {
    bank_account_id: input.bankAccountId,
    series_start: seriesStart,
    series_end: seriesEnd,
    next_no: seriesStart,
    is_active: true,
    created_at: phtStamp(),
  });

  const labels = await accountLabels([input.bankAccountId]);
  return { series: toSeries(created, labels) };
}

/**
 * The drawee banks a received check can be drawn on: the shared `bank_names` registry,
 * so the desk picks one spelling instead of typing "UnionBank", "Union Bank" and "UB".
 */
export async function listDraweeBanks(): Promise<Array<{ id: number; name: string }>> {
  const { rows } = await listItems<{ id: number; bank_name: string | null }>("bank_names", {
    fields: ["id", "bank_name"],
    sort: "bank_name",
    limit: 400,
  });
  return rows
    .map((row) => ({ id: Number(row.id), name: asString(row.bank_name) }))
    .filter((row) => row.name.length > 0);
}
