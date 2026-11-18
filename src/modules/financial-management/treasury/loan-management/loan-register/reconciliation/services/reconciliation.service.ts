import { phtStamp, phtToday } from "../pht";
import { LIABILITY_MAPPING_KEYS, RECONCILIATION_TOLERANCE } from "../constants";
import type {
  ReconciliationResult,
  ReconciliationRow,
  RollForward,
  RollForwardLine,
} from "../types";
import { asString, createItem, getItem, listItems, updateItem } from "./directus";
import { LoanConflictError, LoanNotFoundError, LoanValidationError } from "./errors";

/** DECIMAL columns arrive as strings; arithmetic on a string yields NaN, and Directus then
 *  rejects the NaN as a null on a NOT NULL column. Coerce at the boundary, once. */
function num(value: unknown): number {
  return Number(value ?? 0);
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function num2(value: number): string {
  return round2(value).toFixed(2);
}

type RawEntry = {
  id: number;
  entry_date: string;
  entry_type: string;
  status: string;
  loan_id: number | null;
};

type RawLine = {
  entry_id: number;
  coa_id: number;
  debit: string | number | null;
  credit: string | number | null;
};

type RawPayment = {
  id: number;
  payment_date: string;
  amount: string | number | null;
  status: string;
  kind: string;
  journal_entry_id: number | null;
};

type RawLock = {
  locked_through: string;
  note: string | null;
  reopened_at: string | null;
};

/** Entry types that move the liability accounts upward (they add to what we owe). */
const UPWARD_TYPES = new Set(["RELEASE"]);
/** Entry types that accrue interest or amortize costs onto the liability. */
const ACCRUAL_TYPES = new Set(["INTEREST_ACCRUAL", "MONTH_END_ACCRUAL", "MONTH_END_REVERSAL"]);

export type LiabilityAccount = { key: string; coaId: number; title: string | null };

/**
 * The GL accounts the ledger side is built from. `loan_gl_mapping` is the only source — a page
 * that hard-coded 9030 would keep reconciling after somebody re-pointed the mapping.
 */
export async function loadLiabilityAccounts(): Promise<LiabilityAccount[]> {
  const { rows } = await listItems<{ mapping_key: string; coa_id: number }>("loan_gl_mapping", {
    fields: ["mapping_key", "coa_id"],
    filter: { mapping_key: { _in: [...LIABILITY_MAPPING_KEYS] } },
    limit: 50,
  });
  const byKey = new Map(rows.map((row) => [row.mapping_key, Number(row.coa_id)]));
  const missing = LIABILITY_MAPPING_KEYS.filter((key) => !byKey.has(key));
  if (missing.length > 0) {
    throw new LoanConflictError(
      `${missing.join(", ")} ${missing.length === 1 ? "has" : "have"} no GL account in Loan Settings, so the ledger balance cannot be derived. Set the mapping first.`,
    );
  }
  const coaIds = LIABILITY_MAPPING_KEYS.map((key) => byKey.get(key) as number);
  const { rows: accounts } = await listItems<{ coa_id: number; account_title: string }>("chart_of_accounts", {
    fields: ["coa_id", "account_title"],
    filter: { coa_id: { _in: coaIds } },
    limit: 50,
  });
  const titleById = new Map(accounts.map((row) => [Number(row.coa_id), asString(row.account_title)]));

  return LIABILITY_MAPPING_KEYS.map((key) => {
    const coaId = byKey.get(key) as number;
    const title = titleById.get(coaId) ?? "";
    return { key, coaId, title: title === "" ? null : title };
  });
}

/** The newest lock row that has not been reopened. A reopened row is history, not a lock. */
export async function currentLock(): Promise<RawLock | null> {
  const { rows } = await listItems<RawLock>("loan_period_lock", {
    fields: ["locked_through", "note", "reopened_at"],
    sort: "-locked_through",
    limit: 20,
  });
  return rows.find((row) => !row.reopened_at) ?? null;
}

async function loadEntriesThrough(asOf: string): Promise<RawEntry[]> {
  const { rows } = await listItems<RawEntry>("loan_journal_entry", {
    fields: ["id", "entry_date", "entry_type", "status", "loan_id"],
    filter: { _and: [{ entry_date: { _lte: asOf } }, { status: { _eq: "POSTED" } }] },
    sort: "entry_date,id",
    limit: 5000,
  });
  return rows;
}

/** `loan_journal_line` has no date of its own; the entry carries it. Fetched in chunks because
 *  `_in` with a thousand ids is a URL the instance refuses. */
async function loadLines(entryIds: number[], coaIds: number[]): Promise<RawLine[]> {
  if (entryIds.length === 0) return [];
  const out: RawLine[] = [];
  for (let index = 0; index < entryIds.length; index += 120) {
    const chunk = entryIds.slice(index, index + 120);
    const { rows } = await listItems<RawLine>("loan_journal_line", {
      fields: ["entry_id", "coa_id", "debit", "credit"],
      filter: { _and: [{ entry_id: { _in: chunk } }, { coa_id: { _in: coaIds } }] },
      limit: 5000,
    });
    out.push(...rows);
  }
  return out;
}

/** Credit-positive: a liability grows when it is credited. */
function netCredit(lines: RawLine[]): number {
  return lines.reduce((sum, line) => sum + num(line.credit) - num(line.debit), 0);
}

async function loadPayments(periodStart: string, periodEnd: string): Promise<RawPayment[]> {
  const { rows } = await listItems<RawPayment>("loan_payment", {
    fields: ["id", "payment_date", "amount", "status", "kind", "journal_entry_id"],
    filter: {
      _and: [
        { payment_date: { _gte: periodStart } },
        { payment_date: { _lte: periodEnd } },
        { status: { _eq: "POSTED" } },
      ],
    },
    sort: "payment_date,id",
    limit: 2000,
  });
  return rows;
}

function sum(rows: { amount: number }[]): number {
  return rows.reduce((total, row) => total + row.amount, 0);
}

/**
 * Builds the period roll-forward and ties it to the ledger.
 *
 * The reduction buckets come from documents (`loan_payment` rows), the additions from journal
 * entries by type, and the ledger side from every posted line on the mapped liability accounts —
 * including entry types this module does not classify, so an unclassified posting surfaces as a
 * difference instead of being silently absorbed.
 */
export async function buildRollForward(input: {
  periodStart: string;
  periodEnd: string;
}): Promise<RollForward> {
  const { periodStart, periodEnd } = input;
  if (periodStart > periodEnd) {
    throw new LoanValidationError("The period ends before it starts.", {
      periodEnd: ["The period ends before it starts."],
    });
  }

  const accounts = await loadLiabilityAccounts();
  const coaIds = accounts.map((account) => account.coaId);
  const [entries, lock] = await Promise.all([loadEntriesThrough(periodEnd), currentLock()]);
  const lines = await loadLines(
    entries.map((entry) => entry.id),
    coaIds,
  );

  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const openingLines: RawLine[] = [];
  const periodLines: RawLine[] = [];
  const linesByType = new Map<string, RawLine[]>();

  for (const line of lines) {
    const entry = entryById.get(line.entry_id);
    if (!entry) continue;
    if (entry.entry_date < periodStart) {
      openingLines.push(line);
      continue;
    }
    periodLines.push(line);
    const bucket = linesByType.get(entry.entry_type) ?? [];
    bucket.push(line);
    linesByType.set(entry.entry_type, bucket);
  }

  const openingBalance = round2(netCredit(openingLines));
  const ledgerClosing = round2(openingBalance + netCredit(periodLines));

  const payments = await loadPayments(periodStart, periodEnd);
  const paymentRows = payments.filter((payment) => {
    const entry = payment.journal_entry_id ? entryById.get(payment.journal_entry_id) : null;
    // A prepayment, payoff or restructure is counted in its own bucket from the entry side, so the
    // cash that settled it must not be counted again as an ordinary payment.
    if (!entry) return true;
    return entry.entry_type === "PAYMENT" || entry.entry_type === "CHECK_ENCASHMENT";
  });
  const paymentTotal = round2(sum(paymentRows.map((row) => ({ amount: num(row.amount) }))));

  const newLoansLines = [...UPWARD_TYPES].flatMap((type) => linesByType.get(type) ?? []);
  const accrualLines = [...ACCRUAL_TYPES].flatMap((type) => linesByType.get(type) ?? []);
  const prepaymentLines = linesByType.get("PREPAYMENT") ?? [];
  const restructureLines = linesByType.get("RESTRUCTURE") ?? [];
  const payoffLines = linesByType.get("PAYOFF") ?? [];

  const newLoans = round2(netCredit(newLoansLines));
  const interestAmortization = round2(netCredit(accrualLines));
  const partialPrepayments = round2(-netCredit(prepaymentLines));
  const restructures = round2(-netCredit(restructureLines));
  const payoffs = round2(-netCredit(payoffLines));

  const closingBalance = round2(
    openingBalance + newLoans + interestAmortization - paymentTotal - partialPrepayments - restructures - payoffs,
  );
  const difference = round2(closingBalance - ledgerClosing);
  const result: ReconciliationResult =
    Math.abs(difference) < RECONCILIATION_TOLERANCE ? "RECONCILED" : "DIFFERENCE";

  const peso = (value: number) =>
    new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);

  const sentence =
    result === "RECONCILED"
      ? `The roll-forward closes at ${peso(closingBalance)} and the ledger balance at ${peso(ledgerClosing)}, so the period reconciles.`
      : `The roll-forward closes at ${peso(closingBalance)} against a ledger balance of ${peso(ledgerClosing)}: a difference of ${peso(difference)} the period cannot explain.`;

  const notes: string[] = [];
  const hasRelease = entries.some(
    (entry) => entry.entry_type === "RELEASE" && entry.entry_date <= periodEnd,
  );
  if (!hasRelease) {
    notes.push(
      "No release entry has been posted, so the liability accounts carry no opening balance and the roll-forward runs negative.",
    );
  }
  const unclassified = periodLines.filter((line) => {
    const entry = entryById.get(line.entry_id);
    if (!entry) return false;
    return !(
      UPWARD_TYPES.has(entry.entry_type) ||
      ACCRUAL_TYPES.has(entry.entry_type) ||
      ["PREPAYMENT", "RESTRUCTURE", "PAYOFF", "PAYMENT", "CHECK_ENCASHMENT"].includes(entry.entry_type)
    );
  });
  if (unclassified.length > 0) {
    const types = new Set(
      unclassified.map((line) => entryById.get(line.entry_id)?.entry_type).filter(Boolean) as string[],
    );
    notes.push(
      `${[...types].join(", ")} postings touch the liability accounts but are not part of the roll-forward, so they land in the difference.`,
    );
  }
  const unjournalised = paymentRows.filter((payment) => !payment.journal_entry_id);
  if (unjournalised.length > 0) {
    notes.push(
      `${unjournalised.length} payment${unjournalised.length === 1 ? " has" : "s have"} no journal entry, so the ledger side is short by ${peso(sum(unjournalised.map((row) => ({ amount: num(row.amount) }))))}.`,
    );
  }

  const linesOut: RollForwardLine[] = [
    { key: "opening", label: "Opening balance", amount: openingBalance, count: openingLines.length },
    { key: "newLoans", label: "New loans released", amount: newLoans, count: newLoansLines.length },
    {
      key: "interest",
      label: "Interest and amortization",
      amount: interestAmortization,
      count: accrualLines.length,
    },
    { key: "payments", label: "Payments", amount: -paymentTotal, count: paymentRows.length },
    {
      key: "prepayments",
      label: "Partial prepayments",
      amount: -partialPrepayments,
      count: prepaymentLines.length,
    },
    { key: "restructures", label: "Restructures", amount: -restructures, count: restructureLines.length },
    { key: "payoffs", label: "Payoffs", amount: -payoffs, count: payoffLines.length },
    { key: "closing", label: "Closing balance", amount: closingBalance, count: periodLines.length },
  ];

  const lockedThrough = lock?.locked_through ?? null;

  return {
    periodStart,
    periodEnd,
    openingBalance,
    newLoans,
    interestAmortization,
    payments: paymentTotal,
    partialPrepayments,
    restructures,
    payoffs,
    closingBalance,
    ledgerClosing,
    difference,
    result,
    sentence,
    notes,
    lines: linesOut,
    lockedThrough,
    readOnly: Boolean(lockedThrough && periodEnd <= lockedThrough),
    accounts,
  };
}

type RawReconciliation = {
  id: number;
  period_start: string;
  period_end: string;
  opening_balance: string | number;
  new_loans: string | number;
  interest_amortization: string | number;
  payments: string | number;
  partial_prepayments: string | number;
  restructures: string | number;
  payoffs: string | number;
  closing_balance: string | number;
  difference: string | number;
  result: string;
  remarks: string | null;
  signed_by: number | null;
  signed_at: string | null;
  created_at: string | null;
};

function toRow(raw: RawReconciliation, names: Map<number, string>): ReconciliationRow {
  return {
    id: raw.id,
    periodStart: raw.period_start,
    periodEnd: raw.period_end,
    openingBalance: num(raw.opening_balance),
    newLoans: num(raw.new_loans),
    interestAmortization: num(raw.interest_amortization),
    payments: num(raw.payments),
    partialPrepayments: num(raw.partial_prepayments),
    restructures: num(raw.restructures),
    payoffs: num(raw.payoffs),
    closingBalance: num(raw.closing_balance),
    difference: num(raw.difference),
    result: raw.result === "RECONCILED" ? "RECONCILED" : "DIFFERENCE",
    remarks: raw.remarks,
    signedBy: raw.signed_by,
    signedByName: raw.signed_by ? (names.get(raw.signed_by) ?? null) : null,
    signedAt: raw.signed_at,
    createdAt: raw.created_at,
  };
}

const RECONCILIATION_FIELDS = [
  "id",
  "period_start",
  "period_end",
  "opening_balance",
  "new_loans",
  "interest_amortization",
  "payments",
  "partial_prepayments",
  "restructures",
  "payoffs",
  "closing_balance",
  "difference",
  "result",
  "remarks",
  "signed_by",
  "signed_at",
  "created_at",
];

/**
 * Names behind the numeric ids the tables store.
 *
 * The platform's user directory is the `user` table (`user_id`, `user_fname`, …); `/items/directus_users`
 * answers 403 on this instance, so reading it here would fail the whole sign-off. An unreadable
 * directory leaves the ids alone: a cell prints a dash with the id in its tooltip rather than a
 * number pretending to be a person.
 */
async function namesFor(ids: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return new Map();

  try {
    const { rows } = await listItems<Record<string, unknown>>("user", {
      fields: ["user_id", "user_fname", "user_mname", "user_lname", "user_email"],
      filter: { user_id: { _in: unique } },
      limit: unique.length,
    });
    const names = new Map<number, string>();
    for (const row of rows) {
      const id = Number(row.user_id);
      const full = [row.user_fname, row.user_mname, row.user_lname]
        .map((part) => asString(part).trim())
        .filter(Boolean)
        .join(" ");
      const label = full || asString(row.user_email).trim();
      if (Number.isInteger(id) && id > 0 && label) names.set(id, label);
    }
    return names;
  } catch {
    return new Map();
  }
}

export async function listReconciliations(input: {
  result?: "ALL" | "RECONCILED" | "DIFFERENCE";
  page?: number;
  pageSize?: number;
}): Promise<{ rows: ReconciliationRow[]; total: number; page: number; pageSize: number }> {
  const page = input.page ?? 1;
  const pageSize = input.pageSize && input.pageSize > 0 ? input.pageSize : 10;
  const filter =
    input.result && input.result !== "ALL" ? { result: { _eq: input.result } } : undefined;

  const { rows, total } = await listItems<RawReconciliation>("loan_reconciliation", {
    fields: RECONCILIATION_FIELDS,
    filter,
    sort: "-period_end,-id",
    limit: pageSize,
    page,
  });
  const names = await namesFor(rows.map((row) => Number(row.signed_by ?? 0)));
  return { rows: rows.map((row) => toRow(row, names)), total, page, pageSize };
}

export async function listAllReconciliations(): Promise<ReconciliationRow[]> {
  const { rows } = await listItems<RawReconciliation>("loan_reconciliation", {
    fields: RECONCILIATION_FIELDS,
    sort: "-period_end,-id",
    limit: 2000,
  });
  const names = await namesFor(rows.map((row) => Number(row.signed_by ?? 0)));
  return rows.map((row) => toRow(row, names));
}

/**
 * Saves the roll-forward for its period. One row per period: saving again replaces the figures,
 * so a period cannot accumulate three slightly different versions of the same month.
 */
export async function saveReconciliation(
  input: { periodStart: string; periodEnd: string; remarks?: string },
  actorId: number | null,
): Promise<ReconciliationRow> {
  const rollForward = await buildRollForward(input);
  if (rollForward.readOnly) {
    throw new LoanConflictError(
      `The books are closed through ${rollForward.lockedThrough}, so the period ending ${input.periodEnd} cannot be saved.`,
    );
  }

  const existing = await listItems<{ id: number; signed_at: string | null }>("loan_reconciliation", {
    fields: ["id", "signed_at"],
    filter: { _and: [{ period_start: { _eq: input.periodStart } }, { period_end: { _eq: input.periodEnd } }] },
    limit: 1,
  });
  const previous = existing.rows[0];
  if (previous?.signed_at) {
    throw new LoanConflictError(
      `The period ending ${input.periodEnd} is already signed off, so its figures cannot be replaced. Reopen it first if the ledger moved.`,
    );
  }

  const now = phtStamp();
  const payload = {
    period_start: input.periodStart,
    period_end: input.periodEnd,
    opening_balance: num2(rollForward.openingBalance),
    new_loans: num2(rollForward.newLoans),
    interest_amortization: num2(rollForward.interestAmortization),
    payments: num2(rollForward.payments),
    partial_prepayments: num2(rollForward.partialPrepayments),
    restructures: num2(rollForward.restructures),
    payoffs: num2(rollForward.payoffs),
    closing_balance: num2(rollForward.closingBalance),
    difference: num2(rollForward.difference),
    result: rollForward.result,
    remarks: input.remarks?.trim() ? input.remarks.trim() : null,
    updated_at: now,
    updated_by: actorId,
  };

  const saved = previous
    ? await updateItem<RawReconciliation>("loan_reconciliation", previous.id, payload)
    : await createItem<RawReconciliation>("loan_reconciliation", {
        ...payload,
        created_at: now,
        created_by: actorId,
      });

  const names = await namesFor([Number(saved.signed_by ?? 0)]);
  return toRow(saved, names);
}

/** Sign-off: the actor and the PHT wall clock, written once. */
export async function signOffReconciliation(
  id: number,
  actorId: number | null,
  remarks?: string,
): Promise<ReconciliationRow> {
  if (!actorId) {
    throw new LoanConflictError("Signing off needs a signed-in user, and this request has none.");
  }
  const row = await getItem<RawReconciliation>("loan_reconciliation", id, RECONCILIATION_FIELDS).catch(
    () => null,
  );
  if (!row) throw new LoanNotFoundError("That reconciliation row no longer exists.");

  if (row.period_end && row.signed_at) {
    throw new LoanConflictError(`The period ending ${row.period_end} is already signed off.`);
  }
  const difference = num(row.difference);
  if (row.result !== "RECONCILED" || Math.abs(difference) >= 0.005) {
    throw new LoanConflictError(
      `The period ending ${row.period_end} shows a difference of ₱${difference.toFixed(2)}. Reconcile it before signing off, or the sign-off would freeze that difference as accepted.`,
    );
  }
  const lock = await currentLock();
  if (lock && row.period_end && row.period_end <= lock.locked_through) {
    throw new LoanConflictError(
      `The books are closed through ${lock.locked_through}, so the period ending ${row.period_end} cannot be signed.`,
    );
  }

  const note = remarks?.trim() ? remarks.trim() : row.remarks;
  const saved = await updateItem<RawReconciliation>("loan_reconciliation", id, {
    remarks: note ?? null,
    signed_by: actorId,
    signed_at: phtStamp(),
    updated_at: phtStamp(),
    updated_by: actorId,
  });
  const names = await namesFor([actorId]);
  return toRow(saved, names);
}

/** Today in the PHT wall clock, so the UI can default its period without asking the server. */
export function defaultPeriod(): { periodStart: string; periodEnd: string } {
  const today = phtToday();
  const [year, month] = today.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { periodStart: start, periodEnd: end };
}
