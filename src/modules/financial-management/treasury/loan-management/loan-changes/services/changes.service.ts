import "server-only";

import { CHANGEABLE_STATUSES, MONEY_TOLERANCE } from "../constants";
import type {
  ChangeContext,
  ChangeKind,
  ChangeListRow,
  ChangePreview,
  ChangeRow,
  ChangesSummary,
  LoanFacts,
  LoanOption,
  MoneyAccountOption,
  PlannedJournalLine,
  PlannedRow,
  ScheduleStateRow,
} from "../types";
import { phtStamp, phtToday } from "../pht";
import { planChange } from "./changePlan";
import {
  asNumber,
  createItem,
  createItems,
  deleteItem,
  listItems,
  roundMoney,
  updateItem,
} from "./directus";
import { LoanConflictError, LoanNotFoundError, LoanValidationError } from "./errors";

/**
 * Every write the Prepayments and Changes screen makes.
 *
 * The arithmetic is not here: `changePlan.ts` plans it, this file writes the plan. The dialog
 * previews with the same planner, so what the desk approves is what gets posted.
 */

const LOAN_FIELDS = [
  "id",
  "loan_no",
  "lender_name",
  "principal",
  "current_rate",
  "term_payments",
  "installment_amount",
  "maturity_date",
  "schedule_version",
  "status",
  "advance_balance",
  "grace_days",
  "penalty_rate_monthly",
  "release_date",
  "first_payment_date",
  "repayment_method",
  "payment_frequency",
  "first_period_basis",
  "business_day_rule",
  "eir_rate",
  "closed_at",
];

const SCHEDULE_FIELDS = [
  "id",
  "period_no",
  "due_date",
  "payment_due_date",
  "opening_principal",
  "interest",
  "principal",
  "payment",
  "closing_principal",
  "status",
  "is_restated",
  "paid_principal",
  "paid_interest",
  "penalty_accrued",
  "open_carrying",
  "eir_interest",
  "cost_amortization",
  "close_carrying",
];

const CHANGE_FIELDS = [
  "id",
  "loan_id",
  "change_no",
  "kind",
  "effective_date",
  "amount",
  "penalty_rate",
  "penalty_amount",
  "new_rate",
  "current_borrowing_rate",
  "new_term_payments",
  "prepayment_option",
  "restructure_test_pct",
  "restructure_substantial",
  "gain_loss",
  "old_installment",
  "new_installment",
  "old_maturity",
  "new_maturity",
  "schedule_version",
  "account_id",
  "status",
  "reversed_by_id",
  "journal_entry_id",
  "notes",
  "created_at",
  "created_by",
];

interface RawLoanRow {
  id: number;
  loan_no: string;
  lender_name: string;
  principal: string | number;
  current_rate: string | number;
  term_payments: number;
  installment_amount: string | number;
  maturity_date: string | null;
  schedule_version: number;
  status: string;
  advance_balance: string | number;
  grace_days: number;
  penalty_rate_monthly: string | number;
  release_date: string;
  first_payment_date: string;
  repayment_method: LoanFacts["repaymentMethod"];
  payment_frequency: LoanFacts["paymentFrequency"];
  first_period_basis: LoanFacts["firstPeriodBasis"];
  business_day_rule: LoanFacts["businessDayRule"];
  eir_rate: string | number;
  closed_at: string | null;
}

interface RawScheduleRow {
  id: number;
  period_no: number;
  due_date: string;
  payment_due_date: string;
  opening_principal: string | number;
  interest: string | number;
  principal: string | number;
  payment: string | number;
  closing_principal: string | number;
  status: string;
  is_restated: number | boolean;
  paid_principal: string | number;
  paid_interest: string | number;
  penalty_accrued: string | number;
  open_carrying: string | number;
  eir_interest: string | number;
  cost_amortization: string | number;
  close_carrying: string | number;
}

interface RawChangeRow {
  id: number;
  loan_id: number;
  change_no: string;
  kind: ChangeKind;
  effective_date: string;
  amount: string | number | null;
  penalty_rate: string | number | null;
  penalty_amount: string | number;
  new_rate: string | number | null;
  current_borrowing_rate: string | number | null;
  new_term_payments: number | null;
  prepayment_option: ChangeRow["prepaymentOption"];
  restructure_test_pct: string | number | null;
  restructure_substantial: number | boolean;
  gain_loss: string | number;
  old_installment: string | number | null;
  new_installment: string | number | null;
  old_maturity: string | null;
  new_maturity: string | null;
  schedule_version: number | null;
  account_id: number | null;
  status: ChangeRow["status"];
  reversed_by_id: number | null;
  journal_entry_id: number | null;
  notes: string | null;
  created_at: string;
  created_by: number | null;
}

function mapLoan(row: RawLoanRow): LoanFacts {
  return {
    id: row.id,
    loanNo: row.loan_no,
    lenderName: row.lender_name,
    principal: asNumber(row.principal),
    currentRate: asNumber(row.current_rate),
    termPayments: Number(row.term_payments ?? 0),
    installmentAmount: asNumber(row.installment_amount),
    maturityDate: row.maturity_date,
    scheduleVersion: Number(row.schedule_version ?? 1),
    status: row.status,
    advanceBalance: asNumber(row.advance_balance),
    graceDays: Number(row.grace_days ?? 0),
    penaltyRateMonthly: asNumber(row.penalty_rate_monthly),
    releaseDate: row.release_date,
    firstPaymentDate: row.first_payment_date,
    repaymentMethod: row.repayment_method,
    paymentFrequency: row.payment_frequency,
    firstPeriodBasis: row.first_period_basis,
    businessDayRule: row.business_day_rule,
    eirRate: asNumber(row.eir_rate),
    closedAt: row.closed_at,
  };
}

function mapScheduleRow(row: RawScheduleRow): ScheduleStateRow {
  return {
    id: row.id,
    periodNo: Number(row.period_no),
    dueDate: row.due_date,
    paymentDueDate: row.payment_due_date,
    openingPrincipal: asNumber(row.opening_principal),
    interest: asNumber(row.interest),
    principal: asNumber(row.principal),
    payment: asNumber(row.payment),
    closingPrincipal: asNumber(row.closing_principal),
    status: row.status,
    isRestated: Boolean(Number(row.is_restated)),
    paidPrincipal: asNumber(row.paid_principal),
    paidInterest: asNumber(row.paid_interest),
    penaltyAccrued: asNumber(row.penalty_accrued),
    openCarrying: asNumber(row.open_carrying),
    eirInterest: asNumber(row.eir_interest),
    costAmortization: asNumber(row.cost_amortization),
    closeCarrying: asNumber(row.close_carrying),
  };
}

function mapChangeRow(row: RawChangeRow, extras: Partial<ChangeListRow>): ChangeListRow {
  const change: ChangeRow = {
    id: row.id,
    loanId: row.loan_id,
    changeNo: row.change_no,
    kind: row.kind,
    effectiveDate: row.effective_date,
    amount: row.amount === null ? null : asNumber(row.amount),
    penaltyRate: row.penalty_rate === null ? null : asNumber(row.penalty_rate),
    penaltyAmount: asNumber(row.penalty_amount),
    newRate: row.new_rate === null ? null : asNumber(row.new_rate),
    currentBorrowingRate: row.current_borrowing_rate === null ? null : asNumber(row.current_borrowing_rate),
    newTermPayments: row.new_term_payments === null ? null : Number(row.new_term_payments),
    prepaymentOption: row.prepayment_option,
    restructureTestPct: row.restructure_test_pct === null ? null : asNumber(row.restructure_test_pct),
    restructureSubstantial: Boolean(Number(row.restructure_substantial)),
    gainLoss: asNumber(row.gain_loss),
    oldInstallment: row.old_installment === null ? null : asNumber(row.old_installment),
    newInstallment: row.new_installment === null ? null : asNumber(row.new_installment),
    oldMaturity: row.old_maturity,
    newMaturity: row.new_maturity,
    scheduleVersion: row.schedule_version === null ? null : Number(row.schedule_version),
    accountId: row.account_id,
    status: row.status,
    reversedById: row.reversed_by_id,
    journalEntryId: row.journal_entry_id,
    notes: row.notes,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
  return { ...change, loanNo: null, lenderName: null, accountLabel: null, entryNo: null, ...extras };
}

async function readLoan(loanId: number): Promise<LoanFacts> {
  const { rows } = await listItems<RawLoanRow>("loan", {
    fields: LOAN_FIELDS,
    filter: { id: { _eq: loanId } },
    limit: 1,
  });
  const row = rows[0];
  if (!row) throw new LoanNotFoundError("That loan does not exist.");
  return mapLoan(row);
}

async function readSchedule(loanId: number, version: number): Promise<ScheduleStateRow[]> {
  const { rows } = await listItems<RawScheduleRow>("loan_schedule", {
    fields: SCHEDULE_FIELDS,
    filter: { _and: [{ loan_id: { _eq: loanId } }, { version: { _eq: version } }] },
    sort: "period_no",
    limit: 600,
  });
  return rows.map(mapScheduleRow);
}

export async function listMoneyAccounts(): Promise<MoneyAccountOption[]> {
  const { rows } = await listItems<{
    id: number;
    name: string;
    kind: string;
    coa_id: number;
    is_active: number | boolean;
  }>("loan_payment_account", {
    fields: ["id", "name", "kind", "coa_id", "is_active"],
    sort: "sort,name",
    limit: 100,
  });
  const active = rows.filter((row) => Boolean(Number(row.is_active)));
  if (active.length === 0) return [];

  const coaIds = [...new Set(active.map((row) => Number(row.coa_id)))];
  const { rows: accounts } = await listItems<{ coa_id: number; gl_code: string; account_title: string }>(
    "chart_of_accounts",
    { fields: ["coa_id", "gl_code", "account_title"], filter: { coa_id: { _in: coaIds } }, limit: 200 },
  );
  const byId = new Map(accounts.map((row) => [Number(row.coa_id), row]));

  return active.map((row) => {
    const account = byId.get(Number(row.coa_id));
    const code = account?.gl_code ?? "";
    const title = account?.account_title ?? "";
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      coaId: Number(row.coa_id),
      code,
      title,
      label: code ? `${code} · ${title}` : title || row.name,
    };
  });
}

/** The open loans a change can be recorded against, with what is still owed on each. */
export async function listLoanOptions(): Promise<LoanOption[]> {
  const { rows: loans } = await listItems<RawLoanRow>("loan", {
    fields: ["id", "loan_no", "lender_name", "principal", "installment_amount", "schedule_version", "status"],
    filter: { status: { _in: CHANGEABLE_STATUSES } },
    sort: "-id",
    limit: 200,
  });
  if (loans.length === 0) return [];

  const loanIds = loans.map((row) => row.id);
  const { rows: schedule } = await listItems<{
    loan_id: number;
    version: number;
    principal: string | number;
    paid_principal: string | number;
  }>("loan_schedule", {
    fields: ["loan_id", "version", "principal", "paid_principal"],
    filter: { loan_id: { _in: loanIds } },
    limit: -1,
  });

  const outstandingByLoan = new Map<number, number>();
  for (const row of schedule) {
    const loan = loans.find((item) => item.id === Number(row.loan_id));
    if (!loan) continue;
    if (Number(row.version) !== Number(loan.schedule_version)) continue;
    const left = Math.max(0, asNumber(row.principal) - asNumber(row.paid_principal));
    outstandingByLoan.set(Number(row.loan_id), roundMoney((outstandingByLoan.get(Number(row.loan_id)) ?? 0) + left));
  }

  return loans.map((row) => ({
    id: row.id,
    loanNo: row.loan_no,
    lenderName: row.lender_name,
    status: row.status,
    installmentAmount: asNumber(row.installment_amount),
    outstanding: outstandingByLoan.get(row.id) ?? 0,
  }));
}

async function readLock(): Promise<{ lockedThrough: string; note: string | null } | null> {
  const { rows } = await listItems<{ locked_through: string; note: string | null; reopened_at: string | null }>(
    "loan_period_lock",
    { fields: ["locked_through", "note", "reopened_at"], sort: "-locked_through", limit: 20 },
  );
  const open = rows.find((row) => !row.reopened_at);
  return open ? { lockedThrough: open.locked_through, note: open.note } : null;
}

/**
 * Refuses a change dated inside a closed period, and says which period closes it.
 *
 * The sentence names both dates because "cannot post" without the lock date sends the desk back
 * to the period panel to guess.
 */
async function assertNotLocked(effectiveDate: string): Promise<void> {
  const lock = await readLock();
  if (lock && effectiveDate <= lock.lockedThrough) {
    throw new LoanConflictError(
      `The books are closed through ${lock.lockedThrough}, so a change dated ${effectiveDate} cannot post. Date it after ${lock.lockedThrough}, or reopen the period first.`,
    );
  }
}

export async function loadContext(loanId: number): Promise<ChangeContext> {
  const loan = await readLoan(loanId);
  const schedule = await readSchedule(loan.id, loan.scheduleVersion);
  const accounts = await listMoneyAccounts();
  const lock = await readLock();
  const today = phtToday();

  const changeable = CHANGEABLE_STATUSES.includes(loan.status as (typeof CHANGEABLE_STATUSES)[number]);
  const blockedReason = !changeable
    ? `This loan is ${loan.status.replace(/_/g, " ").toLowerCase()}, so there is nothing left to change. Only an open loan can be prepaid, repriced, restructured or paid off.`
    : schedule.length === 0
      ? "This loan has no schedule yet. Release the loan first."
      : null;

  const lastSettled = [...schedule]
    .reverse()
    .find((row) => row.paidPrincipal > MONEY_TOLERANCE || row.paidInterest > MONEY_TOLERANCE || row.status === "PAID");

  const quote: ChangePreview = planChange({
    loan,
    schedule,
    kind: "PAYOFF",
    effectiveDate: today,
    amount: null,
    prepaymentOption: null,
    newRate: null,
    newTermPayments: null,
    penaltyRate: 0,
  });

  const notices: string[] = [];
  if (lock) {
    notices.push(
      `The books are closed through ${lock.lockedThrough}, so only a change dated after it can post${lock.note ? ` (${lock.note})` : ""}.`,
    );
  }
  if (blockedReason) notices.push(blockedReason);

  return {
    loan,
    schedule,
    accounts,
    lock,
    canChange: blockedReason === null,
    blockedReason,
    lastPostedPaymentDate: lastSettled?.paymentDueDate ?? null,
    payoff: quote.plan ? quote.plan.cashAmount : 0,
    notices,
  };
}

/**
 * The highest number in use plus one. Counting rows instead reuses a number as soon as one row is
 * deleted, and the unique key then rejects the write.
 */
async function nextNumber(collection: string, field: string, prefix: string): Promise<string> {
  const year = phtStamp().slice(0, 4);
  const { rows } = await listItems<Record<string, unknown>>(collection, {
    fields: [field],
    filter: { [field]: { _starts_with: `${prefix}-${year}-` } },
    limit: 500,
  });
  let highest = 0;
  for (const row of rows) {
    const value = String(row[field] ?? "");
    const suffix = Number(value.slice(value.lastIndexOf("-") + 1));
    if (Number.isFinite(suffix) && suffix > highest) highest = suffix;
  }
  return `${prefix}-${year}-${String(highest + 1).padStart(4, "0")}`;
}

/**
 * Turns the plan's mapping keys into accounts.
 *
 * Keys the ledger does not carry are named in the sentence, because a posting that stops on
 * "missing mapping" without saying which one costs a support call.
 */
async function loadGlMapping(keys: string[]): Promise<Record<string, number>> {
  const { rows } = await listItems<{ mapping_key: string; coa_id: number | null }>("loan_gl_mapping", {
    fields: ["mapping_key", "coa_id"],
    limit: 100,
  });
  const mapped: Record<string, number> = {};
  for (const row of rows) {
    if (row.coa_id !== null) mapped[row.mapping_key] = Number(row.coa_id);
  }
  const missing = keys.filter((key) => !mapped[key]);
  if (missing.length > 0) {
    throw new LoanConflictError(
      `The change cannot post because ${missing.map((key) => key.replace(/_/g, " ").toLowerCase()).join(", ")} ${missing.length === 1 ? "has" : "have"} no GL account. Set it in Settings first.`,
    );
  }
  return mapped;
}

interface JournalDraft {
  coaId: number;
  memo: string;
  debit: number;
  credit: number;
}

async function postJournal(
  loanId: number,
  entryDate: string,
  entryType: string,
  description: string,
  lines: JournalDraft[],
  now: string,
  actorId: number | null,
): Promise<{ id: number; entryNo: string }> {
  const totalDebit = roundMoney(lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = roundMoney(lines.reduce((sum, line) => sum + line.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > MONEY_TOLERANCE) {
    throw new LoanConflictError(
      `The journal entry does not balance (₱${totalDebit.toFixed(2)} against ₱${totalCredit.toFixed(2)}), so nothing was posted.`,
    );
  }

  const entryNo = await nextNumber("loan_journal_entry", "entry_no", "LJE");
  const entry = await createItem<{ id: number }>("loan_journal_entry", {
    loan_id: loanId,
    entry_no: entryNo,
    entry_date: entryDate,
    entry_type: entryType,
    description,
    period_key: entryDate.slice(0, 7),
    status: "POSTED",
    total_debit: totalDebit,
    total_credit: totalCredit,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });

  await createItems(
    "loan_journal_line",
    lines.map((line, index) => ({
      entry_id: entry.id,
      line_no: index + 1,
      coa_id: line.coaId,
      memo: line.memo,
      debit: line.debit,
      credit: line.credit,
      created_at: now,
      created_by: actorId,
      updated_at: now,
      updated_by: actorId,
    })),
  );

  return { id: entry.id, entryNo };
}

const EVENT_KIND: Record<ChangeKind, string> = {
  PREPAYMENT: "PREPAYMENT",
  RATE_CHANGE: "RATE_CHANGE",
  RESTRUCTURE: "RESTRUCTURE",
  PAYOFF: "PAYOFF",
};

// A repricing moves no money, so a rate change never reaches the journal: `RATE_CHANGE` has no
// entry type of its own in `loan_journal_entry` and the value below is only a placeholder for a
// path that cannot run while `changePlan` returns no journal lines for it.
const ENTRY_TYPE: Record<ChangeKind, string> = {
  PREPAYMENT: "PREPAYMENT",
  RATE_CHANGE: "PAYMENT",
  RESTRUCTURE: "RESTRUCTURE",
  PAYOFF: "PAYOFF",
};

function journalDrafts(
  lines: readonly PlannedJournalLine[],
  gl: Record<string, number>,
  moneyCoaId: number | null,
): JournalDraft[] {
  return lines.map((line) => {
    const coaId = line.mappingKey === "MONEY_ACCOUNT" ? moneyCoaId : gl[line.mappingKey];
    if (coaId === null || coaId === undefined) {
      throw new LoanValidationError(
        line.mappingKey === "MONEY_ACCOUNT"
          ? "Choose the account the money moves through."
          : `This change posts to line ${line.mappingKey}, so that account has to be mapped first.`,
      );
    }
    return {
      coaId,
      memo: line.memo,
      debit: line.debit,
      credit: line.credit,
    };
  });
}

function scheduleRowPayload(
  loanId: number,
  version: number,
  rows: readonly PlannedRow[],
  now: string,
  actorId: number | null,
) {
  return rows.map((row) => ({
    loan_id: loanId,
    version,
    period_no: row.periodNo,
    due_date: row.dueDate,
    payment_due_date: row.paymentDueDate,
    opening_principal: row.openingPrincipal,
    interest: row.interest,
    principal: row.principal,
    payment: row.payment,
    closing_principal: row.closingPrincipal,
    open_carrying: row.openCarrying,
    eir_interest: row.eirInterest,
    cost_amortization: row.costAmortization,
    close_carrying: row.closeCarrying,
    penalty_accrued: row.penaltyAccrued,
    paid_penalty: 0,
    paid_interest: row.paidInterest,
    paid_principal: row.paidPrincipal,
    status: row.status,
    is_restated: row.isRestated,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  }));
}

export interface RecordChangeInput {
  loanId: number;
  kind: ChangeKind;
  effectiveDate: string;
  amount?: number | null;
  prepaymentOption?: "SHORTEN_TERM" | "LOWER_INSTALLMENT" | null;
  newRate?: number | null;
  newTermPayments?: number | null;
  penaltyRate?: number | null;
  accountId?: number | null;
  notes?: string | null;
}

/**
 * Schedule rows already sitting at a version number are leftovers: the number comes from the loan's
 * own schedule_version, so nothing can legitimately be there before this write. Clearing them first
 * is what lets a retry start clean instead of tripping the unique key on
 * (loan_id, version, period_no).
 */
async function clearVersionRows(loanId: number, version: number): Promise<void> {
  const { rows } = await listItems<{ id: number }>("loan_schedule", {
    fields: ["id"],
    filter: { loan_id: { _eq: loanId }, version: { _eq: version } },
    limit: 500,
  });
  for (const row of rows) {
    await deleteItem("loan_schedule", row.id);
  }
}

/** A journal entry nobody points at must not outlive the write that created it. */
async function clearJournalEntry(entryId: number): Promise<void> {
  const { rows } = await listItems<{ id: number }>("loan_journal_line", {
    fields: ["id"],
    filter: { entry_id: { _eq: entryId } },
    limit: 200,
  });
  for (const row of rows) {
    await deleteItem("loan_journal_line", row.id);
  }
  await deleteItem("loan_journal_entry", entryId);
}

export async function recordChange(body: RecordChangeInput, actorId: number | null): Promise<ChangeListRow> {
  const loan = await readLoan(body.loanId);
  const schedule = await readSchedule(loan.id, loan.scheduleVersion);

  const needsMoney = body.kind === "PREPAYMENT" || body.kind === "PAYOFF";
  const account = needsMoney
    ? (await listMoneyAccounts()).find((item) => item.id === Number(body.accountId ?? 0))
    : null;
  if (needsMoney && !account) {
    throw new LoanValidationError("Choose the account the money moves through.", {
      accountId: ["That account is not in the payment account list."],
    });
  }

  await assertNotLocked(body.effectiveDate);

  const preview = planChange({
    loan,
    schedule,
    kind: body.kind,
    effectiveDate: body.effectiveDate,
    amount: body.amount ?? null,
    prepaymentOption: body.prepaymentOption ?? null,
    newRate: body.newRate ?? null,
    newTermPayments: body.newTermPayments ?? null,
    penaltyRate: body.penaltyRate ?? 0,
  });
  if (!preview.plan) {
    throw new LoanValidationError(preview.error, { effectiveDate: [preview.error] });
  }
  const plan = preview.plan;

  const keys = [...new Set(plan.journalLines.map((line) => line.mappingKey))].filter(
    (key) => key !== "MONEY_ACCOUNT",
  );
  const gl = keys.length > 0 ? await loadGlMapping(keys) : {};
  const now = phtStamp();
  const version = plan.version;

  // Everything below writes four collections in a row, and a failure part way through must leave
  // nothing behind: no rows a retry would collide with, no entry nobody points at, no change the
  // loan never made.
  await clearVersionRows(loan.id, version);

  let journalEntryId: number | null = null;
  let journalEntryNo: string | null = null;
  let changeId: number | null = null;

  try {
    // The version is written first: a change row that points at a version which does not exist is
    // worse than a version nobody points at yet.
    if (plan.rows.length > 0) {
      await createItems("loan_schedule", scheduleRowPayload(loan.id, version, plan.rows, now, actorId));
    }

    if (plan.journalLines.length > 0) {
      const posted = await postJournal(
        loan.id,
        body.effectiveDate,
        ENTRY_TYPE[body.kind],
        `${body.kind === "PREPAYMENT" ? "Prepayment" : body.kind === "PAYOFF" ? "Payoff" : body.kind === "RESTRUCTURE" ? "Restructure" : "Rate change"} · ${loan.loanNo}`,
        journalDrafts(plan.journalLines, gl, account?.coaId ?? null),
        now,
        actorId,
      );
      journalEntryId = posted.id;
      journalEntryNo = posted.entryNo;
    }

    const changeNo = await nextNumber("loan_change", "change_no", "CHG");
    const change = await createItem<{ id: number }>("loan_change", {
      loan_id: loan.id,
      change_no: changeNo,
      kind: body.kind,
      effective_date: body.effectiveDate,
      amount: plan.principalPaid > 0 && body.kind !== "PAYOFF" ? plan.principalPaid : null,
      penalty_rate: plan.penaltyRate,
      penalty_amount: plan.penaltyAmount,
      new_rate: body.kind === "RATE_CHANGE" || body.kind === "RESTRUCTURE" ? (body.newRate ?? loan.currentRate) : null,
      current_borrowing_rate: loan.currentRate,
      new_term_payments: body.kind === "RESTRUCTURE" ? (body.newTermPayments ?? null) : null,
      prepayment_option: body.kind === "PREPAYMENT" ? (body.prepaymentOption ?? null) : null,
      restructure_test_pct: plan.testPct,
      restructure_substantial: plan.substantial ? 1 : 0,
      gain_loss: plan.gainLoss,
      old_installment: plan.oldInstallment,
      new_installment: plan.newInstallment,
      old_maturity: plan.oldMaturity,
      new_maturity: plan.newMaturity,
      schedule_version: version,
      account_id: account ? account.id : null,
      status: "POSTED",
      journal_entry_id: journalEntryId,
      notes: body.notes ?? null,
      created_at: now,
      created_by: actorId,
      updated_at: now,
      updated_by: actorId,
    });
    changeId = change.id;

    // The loan moves last: if a schedule or a journal write fails above, the loan still points at
    // the version it was on, and the failure is visible instead of half-applied.
    const loanPatch: Record<string, unknown> = {
      schedule_version: version,
      updated_at: now,
      updated_by: actorId,
    };
    if (body.kind === "RATE_CHANGE" || body.kind === "RESTRUCTURE") {
      loanPatch.current_rate = plan.newInstallment === 0 ? loan.currentRate : (body.newRate ?? loan.currentRate);
    }
    if (plan.newInstallment > 0) loanPatch.installment_amount = plan.newInstallment;
    if (plan.newMaturity) loanPatch.maturity_date = plan.newMaturity;
    if (plan.closesLoan) {
      loanPatch.status = "PAID_OFF";
      loanPatch.closed_at = body.effectiveDate;
      loanPatch.installment_amount = 0;
    }
    await updateItem("loan", loan.id, loanPatch);

    await createItem("loan_event", {
      loan_id: loan.id,
      kind: EVENT_KIND[body.kind],
      occurred_at: now,
      description: `${changeNo} · ${body.kind.replace(/_/g, " ").toLowerCase()} effective ${body.effectiveDate}${
        plan.closesLoan ? ", loan closed" : `, installment ₱${plan.newInstallment.toFixed(2)}`
      }`,
      amount: plan.cashAmount,
      reference: changeNo,
      actor_id: actorId,
      created_at: now,
      created_by: actorId,
      updated_at: now,
      updated_by: actorId,
    });

    return mapChangeRow(
      {
        id: change.id,
        loan_id: loan.id,
        change_no: changeNo,
        kind: body.kind,
        effective_date: body.effectiveDate,
        amount: plan.principalPaid > 0 && body.kind !== "PAYOFF" ? plan.principalPaid : null,
        penalty_rate: plan.penaltyRate,
        penalty_amount: plan.penaltyAmount,
        new_rate: body.kind === "RATE_CHANGE" || body.kind === "RESTRUCTURE" ? (body.newRate ?? loan.currentRate) : null,
        current_borrowing_rate: loan.currentRate,
        new_term_payments: body.kind === "RESTRUCTURE" ? (body.newTermPayments ?? null) : null,
        prepayment_option: body.kind === "PREPAYMENT" ? (body.prepaymentOption ?? null) : null,
        restructure_test_pct: plan.testPct,
        restructure_substantial: plan.substantial ? 1 : 0,
        gain_loss: plan.gainLoss,
        old_installment: plan.oldInstallment,
        new_installment: plan.newInstallment,
        old_maturity: plan.oldMaturity,
        new_maturity: plan.closesLoan ? body.effectiveDate : plan.newMaturity,
        schedule_version: version,
        account_id: account ? account.id : null,
        status: "POSTED",
        reversed_by_id: null,
        journal_entry_id: journalEntryId,
        notes: body.notes ?? null,
        created_at: now,
        created_by: actorId,
      },
      { loanNo: loan.loanNo, lenderName: loan.lenderName, accountLabel: account?.label ?? null, entryNo: journalEntryNo },
    );
  } catch (error) {
    // Roll back what this attempt wrote, then let the caller see the original failure.
    await clearVersionRows(loan.id, version).catch(() => undefined);
    if (journalEntryId !== null) {
      await clearJournalEntry(journalEntryId).catch(() => undefined);
    }
    if (changeId !== null) {
      await deleteItem("loan_change", changeId).catch(() => undefined);
    }
    throw error;
  }
}

export async function listChanges(query: {
  q?: string;
  kind?: ChangeKind;
  loanId?: number;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: ChangeListRow[]; total: number; summary: ChangesSummary }> {
  const filter: Record<string, unknown> = {};
  if (query.kind) filter.kind = { _eq: query.kind };
  if (query.loanId) filter.loan_id = { _eq: query.loanId };
  if (query.from) filter.effective_date = { ...(filter.effective_date as object), _gte: query.from };
  if (query.to) filter.effective_date = { ...(filter.effective_date as object), _lte: query.to };

  const { rows, total } = await listItems<RawChangeRow>("loan_change", {
    fields: CHANGE_FIELDS,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
    sort: "-effective_date,-id",
    limit: 500,
  });

  const loanIds = [...new Set(rows.map((row) => row.loan_id))];
  const emptyLoans: { rows: Array<{ id: number; loan_no: string; lender_name: string }>; total: number } = {
    rows: [],
    total: 0,
  };
  const [{ rows: loans }, accounts] = await Promise.all([
    loanIds.length > 0
      ? listItems<{ id: number; loan_no: string; lender_name: string }>("loan", {
          fields: ["id", "loan_no", "lender_name"],
          filter: { id: { _in: loanIds } },
          limit: 200,
        })
      : Promise.resolve(emptyLoans),
    listMoneyAccounts(),
  ]);

  const entryIds = rows.map((row) => row.journal_entry_id).filter((id): id is number => id !== null);
  const emptyEntries: { rows: Array<{ id: number; entry_no: string }>; total: number } = { rows: [], total: 0 };
  const { rows: entries } =
    entryIds.length > 0
      ? await listItems<{ id: number; entry_no: string }>("loan_journal_entry", {
          fields: ["id", "entry_no"],
          filter: { id: { _in: entryIds } },
          limit: 500,
        })
      : emptyEntries;

  const loanById = new Map(loans.map((row) => [row.id, row]));
  const accountById = new Map(accounts.map((row) => [row.id, row]));
  const entryById = new Map(entries.map((row) => [row.id, row.entry_no]));

  const mapped = rows.map((row) => {
    const loan = loanById.get(row.loan_id);
    const account = row.account_id === null ? null : accountById.get(row.account_id);
    return mapChangeRow(row, {
      loanNo: loan?.loan_no ?? null,
      lenderName: loan?.lender_name ?? null,
      accountLabel: account?.label ?? null,
      entryNo: row.journal_entry_id === null ? null : (entryById.get(row.journal_entry_id) ?? null),
    });
  });

  const needle = (query.q ?? "").trim().toLowerCase();
  const searched =
    needle.length === 0
      ? mapped
      : mapped.filter((row) =>
          [row.changeNo, row.loanNo ?? "", row.lenderName ?? "", row.notes ?? "", row.kind]
            .join(" ")
            .toLowerCase()
            .includes(needle),
        );

  const summary: ChangesSummary = {
    posted: searched.filter((row) => row.status === "POSTED").length,
    reversed: searched.filter((row) => row.status === "REVERSED").length,
    prepaymentsTotal: roundMoney(
      searched
        .filter((row) => row.status === "POSTED" && (row.kind === "PREPAYMENT" || row.kind === "PAYOFF"))
        .reduce((sum, row) => sum + (row.amount ?? 0), 0),
    ),
    payoffsTotal: searched.filter((row) => row.status === "POSTED" && row.kind === "PAYOFF").length,
    gainLossTotal: roundMoney(searched.filter((row) => row.status === "POSTED").reduce((sum, row) => sum + row.gainLoss, 0)),
  };

  const start = (query.page - 1) * query.pageSize;
  return { rows: searched.slice(start, start + query.pageSize), total: searched.length || (needle ? 0 : total), summary };
}

export async function getChange(id: number): Promise<ChangeListRow> {
  const { rows } = await listItems<RawChangeRow>("loan_change", {
    fields: CHANGE_FIELDS,
    filter: { id: { _eq: id } },
    limit: 1,
  });
  const row = rows[0];
  if (!row) throw new LoanNotFoundError("That change does not exist.");
  const [loan, accounts, entry] = await Promise.all([
    readLoan(row.loan_id).catch(() => null),
    listMoneyAccounts(),
    row.journal_entry_id !== null
      ? listItems<{ entry_no: string }>("loan_journal_entry", {
          fields: ["entry_no"],
          filter: { id: { _eq: row.journal_entry_id } },
          limit: 1,
        })
      : Promise.resolve(null),
  ]);
  const account = row.account_id === null ? null : accounts.find((item) => item.id === row.account_id);
  const entryNo = entry?.rows[0]?.entry_no ?? null;
  return mapChangeRow(row, {
    loanNo: loan?.loanNo ?? null,
    lenderName: loan?.lenderName ?? null,
    accountLabel: account?.label ?? null,
    entryNo,
  });
}

/**
 * Reverses the change: a mirror journal entry, the change marked REVERSED, and the loan put back
 * on the version it ran before, so nothing points at a schedule that is no longer live.
 */
export async function reverseChange(id: number, reason: string | null, actorId: number | null): Promise<ChangeListRow> {
  const change = await getChange(id);
  if (change.status === "REVERSED") {
    throw new LoanConflictError(`${change.changeNo} is already reversed.`);
  }

  const loan = await readLoan(change.loanId);
  if (loan.scheduleVersion !== change.scheduleVersion) {
    throw new LoanConflictError(
      `${change.changeNo} produced version ${change.scheduleVersion ?? "none"}, but the loan now runs on version ${loan.scheduleVersion}. Only the most recent change can be reversed.`,
    );
  }

  const now = phtStamp();
  const previousVersion = Math.max(1, (change.scheduleVersion ?? 1) - 1);

  const [linesRes, originalRes, previousRows] = await Promise.all([
    change.journalEntryId !== null
      ? listItems<{ coa_id: number; memo: string; debit: string | number; credit: string | number }>(
          "loan_journal_line",
          {
            fields: ["coa_id", "memo", "debit", "credit"],
            filter: { entry_id: { _eq: change.journalEntryId } },
            sort: "line_no",
            limit: 100,
          },
        )
      : Promise.resolve({
          rows: [] as { coa_id: number; memo: string; debit: string | number; credit: string | number }[],
        }),
    change.journalEntryId !== null
      ? listItems<{ entry_no: string }>("loan_journal_entry", {
          fields: ["entry_no"],
          filter: { id: { _eq: change.journalEntryId } },
          limit: 1,
        })
      : Promise.resolve({ rows: [] as { entry_no: string }[] }),
    readSchedule(loan.id, previousVersion),
  ]);

  let mirror: { id: number; entryNo: string } | null = null;
  let originalNo: string | null = null;

  if (change.journalEntryId !== null) {
    originalNo = originalRes.rows[0]?.entry_no ?? null;
    mirror = await postJournal(
      loan.id,
      change.effectiveDate,
      ENTRY_TYPE[change.kind],
      `Reversal of ${change.changeNo}${reason ? ` · ${reason}` : ""}`,
      linesRes.rows.map((line) => ({
        coaId: Number(line.coa_id),
        memo: `Reversal · ${line.memo}`,
        debit: asNumber(line.credit),
        credit: asNumber(line.debit),
      })),
      now,
      actorId,
    );
  }

  // Undoing a change must not quietly cure a loan that was already behind: the schedule comes back
  // on its own evidence, so a period still marked OVERDUE brings the loan back as OVERDUE.
  const stillOverdue = previousRows.some((row) => row.status === "OVERDUE");
  const loanPatch: Record<string, unknown> = {
    schedule_version: previousVersion,
    status: stillOverdue ? "OVERDUE" : "CURRENT",
    closed_at: null,
    updated_at: now,
    updated_by: actorId,
  };
  if (change.currentBorrowingRate !== null) loanPatch.current_rate = change.currentBorrowingRate;
  if (change.oldInstallment !== null && change.oldInstallment > 0) loanPatch.installment_amount = change.oldInstallment;
  if (change.oldMaturity) loanPatch.maturity_date = change.oldMaturity;
  else if (previousRows.length > 0) {
    loanPatch.maturity_date = previousRows[previousRows.length - 1].paymentDueDate;
  }

  const nextNotes = reason ? `${change.notes ? `${change.notes} · ` : ""}Reversed: ${reason}` : change.notes;

  const writes: Promise<unknown>[] = [
    updateItem("loan", loan.id, loanPatch),
    // `reversed_by_id` refers to a change row; reversing posts a mirror entry rather than a second
    // change, so the column stays empty and the entry pair carries the link.
    updateItem("loan_change", change.id, {
      status: "REVERSED",
      reversed_by_id: null,
      notes: nextNotes,
      updated_at: now,
      updated_by: actorId,
    }),
    createItem("loan_event", {
      loan_id: loan.id,
      kind: "SCHEDULE_REBUILT",
      occurred_at: now,
      description: `${change.changeNo} reversed; the loan is back on schedule version ${previousVersion}.`,
      amount: null,
      reference: change.changeNo,
      actor_id: actorId,
      created_at: now,
      created_by: actorId,
      updated_at: now,
      updated_by: actorId,
    }),
  ];

  if (mirror && change.journalEntryId !== null) {
    // The pair has to point at each other: the original entry names the entry that reversed it,
    // and the mirror names the entry it reverses. Writing the original's own number into its own
    // reverses_entry_no told a reader that the entry reversed itself.
    writes.push(
      updateItem("loan_journal_entry", mirror.id, {
        reverses_entry_no: originalNo,
        updated_at: now,
        updated_by: actorId,
      }),
      updateItem("loan_journal_entry", change.journalEntryId, {
        status: "REVERSED",
        reverses_entry_no: mirror.entryNo,
        updated_at: now,
        updated_by: actorId,
      }),
    );
  }

  await Promise.all(writes);

  return {
    ...change,
    status: "REVERSED",
    reversedById: null,
    notes: nextNotes,
  };
}
