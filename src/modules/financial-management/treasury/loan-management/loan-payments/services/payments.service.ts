import "server-only";

import { phtStamp } from "../pht";
import type { PaymentForm } from "../schemas";
import type { LoanOption } from "../types";
import type {
  AllocationRow,
  InstallmentRow,
  LoanPaymentRow,
  PaymentAccountRow,
  PaymentContext,
  PaymentListRow,
  PaymentsSummary,
} from "../types";
import {
  daysBetween,
  penaltyAccrued,
  planAllocation,
  round2,
  type InstallmentDue,
} from "./allocation";
import { createItem, createItems, listItems, updateItem } from "./directus";
import { LoanConflictError, LoanNotFoundError, LoanValidationError } from "./errors";

const LOAN_FIELDS = [
  "id",
  "loan_no",
  "lender_name",
  "principal",
  "installment_amount",
  "status",
  "grace_days",
  "penalty_rate_monthly",
  "advance_balance",
  "maturity_date",
  "schedule_version",
  "proceeds_account_id",
];

const SCHEDULE_FIELDS = [
  "id",
  "period_no",
  "due_date",
  "payment_due_date",
  "interest",
  "principal",
  "payment",
  "paid_interest",
  "paid_principal",
  "penalty_accrued",
  "status",
];

const PAYMENT_FIELDS = [
  "id",
  "loan_id",
  "payment_no",
  "payment_date",
  "amount",
  "account_id",
  "method",
  "check_no",
  "check_date",
  "encashed_on",
  "encashed_account_id",
  "lender_receipt",
  "kind",
  "charge_amount",
  "bank_charge",
  "advance_created",
  "status",
  "reversed_by_id",
  "reverses_id",
  "journal_entry_id",
  "remarks",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
];

/** Directus returns DECIMAL columns as strings; every sum has to see a number. */
function num(value: unknown): number {
  return Number(value ?? 0);
}

interface LoanContextRow {
  id: number;
  loan_no: string;
  lender_name: string;
  principal: number;
  installment_amount: number;
  status: string;
  grace_days: number;
  penalty_rate_monthly: number;
  advance_balance: number;
  maturity_date: string | null;
  schedule_version: number;
  proceeds_account_id: number;
}

interface ScheduleDbRow {
  id: number;
  period_no: number;
  due_date: string;
  payment_due_date: string;
  interest: number;
  principal: number;
  payment: number;
  paid_interest: number;
  paid_principal: number;
  penalty_accrued: number;
  status: string;
}

export async function listPaymentAccounts(): Promise<PaymentAccountRow[]> {
  const { rows } = await listItems<PaymentAccountRow>("loan_payment_account", {
    fields: ["id", "name", "kind", "coa_id", "is_active", "sort", "charge_pct"],
    sort: "sort,name",
    limit: 100,
  });
  return rows
    .filter((row) => Boolean(Number(row.is_active)))
    .map((row) => ({ ...row, charge_pct: num(row.charge_pct) }));
}

async function loadGlMapping(keys: string[]): Promise<Record<string, number>> {
  const { rows } = await listItems<{ mapping_key: string; coa_id: number | null }>(
    "loan_gl_mapping",
    { fields: ["mapping_key", "coa_id"], limit: 100 },
  );
  const mapped: Record<string, number> = {};
  for (const row of rows) {
    if (row.coa_id !== null) mapped[row.mapping_key] = row.coa_id;
  }
  const missing = keys.filter((key) => !mapped[key]);
  if (missing.length > 0) {
    throw new LoanConflictError(
      `The payment cannot post because ${missing.map((key) => key.replace(/_/g, " ").toLowerCase()).join(", ")} ${missing.length === 1 ? "has" : "have"} no GL account. Set it in Settings first.`,
    );
  }
  return mapped;
}

async function getLoanRow(loanId: number): Promise<LoanContextRow> {
  const { rows } = await listItems<LoanContextRow>("loan", {
    fields: LOAN_FIELDS,
    filter: { id: { _eq: loanId } },
    limit: 1,
  });
  const row = rows[0];
  if (!row) throw new LoanNotFoundError("That loan does not exist.");
  // Directus hands DECIMAL columns back as strings, and string arithmetic silently becomes NaN,
  // which Directus then rejects as a null on a NOT NULL column. Coerce at the boundary.
  return {
    ...row,
    principal: Number(row.principal),
    installment_amount: Number(row.installment_amount),
    grace_days: Number(row.grace_days),
    penalty_rate_monthly: Number(row.penalty_rate_monthly),
    advance_balance: Number(row.advance_balance),
    schedule_version: Number(row.schedule_version),
    proceeds_account_id: Number(row.proceeds_account_id),
  };
}

async function getSchedule(loan: LoanContextRow): Promise<ScheduleDbRow[]> {
  const { rows } = await listItems<ScheduleDbRow>("loan_schedule", {
    fields: SCHEDULE_FIELDS,
    filter: { _and: [{ loan_id: { _eq: loan.id } }, { version: { _eq: loan.schedule_version } }] },
    sort: "period_no",
    limit: 400,
  });
  return rows.map((row) => ({
    ...row,
    period_no: Number(row.period_no),
    interest: Number(row.interest),
    principal: Number(row.principal),
    payment: Number(row.payment),
    paid_interest: Number(row.paid_interest),
    paid_principal: Number(row.paid_principal),
    penalty_accrued: Number(row.penalty_accrued),
  }));
}

/**
 * The penalty each unpaid installment has run up by the given date.
 *
 * Charged only past the grace period, on the interest and principal still outstanding, at the
 * loan's monthly penalty rate divided by thirty: the document's rule, not a daily 365 basis.
 */
function penaltiesAt(loan: LoanContextRow, schedule: ScheduleDbRow[], asOf: string) {
  return schedule.map((row) => {
    const interestOutstanding = round2(row.interest - row.paid_interest);
    const principalOutstanding = round2(row.principal - row.paid_principal);
    const overdueAmount = round2(interestOutstanding + principalOutstanding);
    const daysLate = daysBetween(row.payment_due_date, asOf);
    return {
      row,
      interestOutstanding,
      principalOutstanding,
      penalty: penaltyAccrued(
        overdueAmount,
        daysLate,
        loan.grace_days,
        loan.penalty_rate_monthly,
      ),
      overdue: overdueAmount > 0 && daysLate > 0,
    };
  });
}

/**
 * What the route hands over after revalidation: the dialog's form plus the values JSON
 * forces to `null` (a check number on a transfer payment has no value to send).
 */
export type PaymentBody = Omit<PaymentForm, "checkNo" | "checkDate" | "lenderReceipt" | "remarks"> & {
  checkNo?: string | null;
  checkDate?: string | null;
  lenderReceipt?: string | null;
  remarks?: string | null;
};

/** Loans that can take a payment today: the service refuses anything but an open loan. */
export async function listLoanOptions(): Promise<LoanOption[]> {
  const { rows } = await listItems<{
    id: number;
    loan_no: string;
    lender_name: string;
    principal: string;
    installment_amount: string;
    status: string;
    advance_balance: string;
  }>("loan", {
    fields: ["id", "loan_no", "lender_name", "principal", "installment_amount", "status", "advance_balance"],
    filter: { status: { _in: ["CURRENT", "OVERDUE"] } },
    sort: "-id",
    limit: 200,
  });

  return rows.map((row) => ({
    id: row.id,
    loanNo: row.loan_no,
    lenderName: row.lender_name,
    principal: num(row.principal),
    installmentAmount: num(row.installment_amount),
    advanceBalance: num(row.advance_balance),
    status: row.status,
  }));
}

export async function loadContext(loanId: number): Promise<PaymentContext> {
  const loan = await getLoanRow(loanId);
  const schedule = await getSchedule(loan);
  const accounts = await listPaymentAccounts();
  const today = phtStamp().slice(0, 10);
  const computed = penaltiesAt(loan, schedule, today);

  const installments = computed
    .filter((item) => item.interestOutstanding > 0 || item.principalOutstanding > 0 || item.penalty > 0)
    .map((item) => ({
      id: item.row.id,
      periodNo: item.row.period_no,
      dueDate: item.row.due_date,
      paymentDueDate: item.row.payment_due_date,
      interestOutstanding: item.interestOutstanding,
      principalOutstanding: item.principalOutstanding,
      penalty: item.penalty,
      totalOutstanding: round2(item.interestOutstanding + item.principalOutstanding + item.penalty),
      // The stored status only moves when the schedule is refreshed, so an installment whose
      // due date has passed would still read UPCOMING here. Derive the reading from the date.
      status:
        item.row.status === "PAID" || item.row.status === "PARTLY_PAID"
          ? item.row.status
          : item.overdue
            ? "OVERDUE"
            : item.row.payment_due_date <= today
              ? "DUE"
              : "UPCOMING",
      overdue: item.overdue,
    }));

  const next = installments.find((item) => item.totalOutstanding > 0);
  const payoff = round2(installments.reduce((sum, item) => sum + item.totalOutstanding, 0));
  const notices: string[] = [];
  if (installments.length === 0) notices.push("This loan has nothing left to pay.");
  if (next && next.penalty > 0) {
    notices.push(`Installment ${next.periodNo} carries a ₱${next.penalty.toFixed(2)} penalty already accrued to today.`);
  }

  return {
    loan: {
      id: loan.id,
      loan_no: loan.loan_no,
      lender_name: loan.lender_name,
      principal: loan.principal,
      installment_amount: loan.installment_amount,
      status: loan.status,
      grace_days: loan.grace_days,
      penalty_rate_monthly: loan.penalty_rate_monthly,
      advance_balance: loan.advance_balance,
      maturity_date: loan.maturity_date,
      schedule_version: loan.schedule_version,
    },
    installments,
    accounts,
    suggested: next ? next.totalOutstanding : 0,
    payoff,
    notices,
  };
}

async function nextNumber(collection: "loan_payment" | "loan_journal_entry", field: string, prefix: string): Promise<string> {
  const year = phtStamp().slice(0, 4);
  const { total } = await listItems<{ id: number }>(collection, {
    fields: ["id"],
    filter: { [field]: { _starts_with: `${prefix}-${year}-` } },
    limit: 1,
  });
  return `${prefix}-${year}-${String(total + 1).padStart(4, "0")}`;
}

interface JournalLine {
  coa_id: number;
  memo: string;
  debit: number;
  credit: number;
}

async function postJournal(
  loanId: number,
  entryDate: string,
  description: string,
  lines: JournalLine[],
  now: string,
  actorId: number | null,
): Promise<number> {
  const totalDebit = round2(lines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round2(lines.reduce((sum, line) => sum + line.credit, 0));
  if (totalDebit !== totalCredit) {
    throw new LoanConflictError(
      `The journal entry does not balance (₱${totalDebit.toFixed(2)} against ₱${totalCredit.toFixed(2)}), so nothing was posted.`,
    );
  }

  const entryNo = await nextNumber("loan_journal_entry", "entry_no", "LJE");
  const entry = await createItem<{ id: number }>("loan_journal_entry", {
    loan_id: loanId,
    entry_no: entryNo,
    entry_date: entryDate,
    entry_type: "PAYMENT",
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
      coa_id: line.coa_id,
      memo: line.memo,
      debit: line.debit,
      credit: line.credit,
      created_at: now,
      created_by: actorId,
      updated_at: now,
      updated_by: actorId,
    })),
  );

  return entry.id;
}

async function assertNotLocked(paymentDate: string): Promise<void> {
  const { rows } = await listItems<{ locked_through: string; reopened_at: string | null }>(
    "loan_period_lock",
    { fields: ["locked_through", "reopened_at"], sort: "-locked_through", limit: 1 },
  );
  const open = rows.find((row) => !row.reopened_at);
  if (open && paymentDate <= open.locked_through) {
    throw new LoanConflictError(
      `The books are closed through ${open.locked_through}, so a payment dated ${paymentDate} cannot post.`,
    );
  }
}

export async function recordPayment(body: PaymentBody, actorId: number | null): Promise<LoanPaymentRow> {
  const loan = await getLoanRow(body.loanId);
  if (!["CURRENT", "OVERDUE"].includes(loan.status)) {
    throw new LoanConflictError(
      `This loan is ${loan.status.replace(/_/g, " ").toLowerCase()}, so a payment cannot be recorded against it.`,
    );
  }

  await assertNotLocked(body.paymentDate);

  const account = (await listPaymentAccounts()).find((item) => item.id === body.accountId);
  if (!account) {
    throw new LoanValidationError("Choose the account the money came from.", {
      accountId: ["That account is not in the payment account list."],
    });
  }

  const schedule = await getSchedule(loan);
  const computed = penaltiesAt(loan, schedule, body.paymentDate);
  const due: InstallmentDue[] = computed.map((item) => ({
    periodNo: item.row.period_no,
    dueDate: item.row.payment_due_date,
    penalty: item.penalty,
    interestOutstanding: item.interestOutstanding,
    principalOutstanding: item.principalOutstanding,
  }));

  const allocation = planAllocation(due, body.amount);
  if (allocation.length === 0) {
    throw new LoanValidationError("There is nothing outstanding to apply this payment to.", {
      amount: ["The loan has no unpaid installment."],
    });
  }

  // The account's charge percentage is added on top of the installment and booked as an expense,
  // so the cash the borrower hands over is the payment plus that charge (document P114).
  const chargePct = num(account.charge_pct);
  const bankCharge = chargePct > 0 ? round2((round2(body.amount) * chargePct) / 100) : 0;
  const gl = await loadGlMapping(
    bankCharge > 0
      ? ["LOAN_PRINCIPAL", "ACCRUED_INTEREST", "PENALTY_EXPENSE", "ADVANCE_TO_LENDER", "BANK_CHARGE"]
      : ["LOAN_PRINCIPAL", "ACCRUED_INTEREST", "PENALTY_EXPENSE", "ADVANCE_TO_LENDER"],
  );
  const now = phtStamp();
  const totals = {
    penalty: round2(allocation.filter((line) => line.bucket === "PENALTY").reduce((sum, line) => sum + line.amount, 0)),
    interest: round2(allocation.filter((line) => line.bucket === "INTEREST").reduce((sum, line) => sum + line.amount, 0)),
    principal: round2(allocation.filter((line) => line.bucket === "PRINCIPAL").reduce((sum, line) => sum + line.amount, 0)),
    advance: round2(allocation.filter((line) => line.bucket === "ADVANCE").reduce((sum, line) => sum + line.amount, 0)),
  };

  const paymentNo = await nextNumber("loan_payment", "payment_no", "PMT");
  const payment = await createItem<LoanPaymentRow>("loan_payment", {
    loan_id: loan.id,
    payment_no: paymentNo,
    payment_date: body.paymentDate,
    amount: body.amount,
    account_id: account.id,
    method: body.method,
    check_no: body.method === "CHECK" ? body.checkNo ?? null : null,
    check_date: body.method === "CHECK" ? body.checkDate ?? null : null,
    lender_receipt: body.lenderReceipt || null,
    kind: body.kind,
    charge_amount: totals.penalty,
    bank_charge: bankCharge,
    advance_created: totals.advance,
    status: "POSTED",
    remarks: body.remarks || null,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });

  const byPeriod = new Map<number, ScheduleDbRow>();
  for (const row of schedule) byPeriod.set(row.period_no, row);

  await createItems(
    "loan_payment_allocation",
    allocation.map((line) => ({
      payment_id: payment.id,
      installment_id: line.periodNo === null ? null : byPeriod.get(line.periodNo)?.id ?? null,
      bucket: line.bucket,
      amount: line.amount,
      created_at: now,
      created_by: actorId,
      updated_at: now,
      updated_by: actorId,
    })),
  );

  let principalLeft = 0;
  let anyOverdue = false;
  for (const item of computed) {
    const penalty = round2(
      allocation
        .filter((line) => line.periodNo === item.row.period_no && line.bucket === "PENALTY")
        .reduce((sum, line) => sum + line.amount, 0),
    );
    const interest = round2(
      allocation
        .filter((line) => line.periodNo === item.row.period_no && line.bucket === "INTEREST")
        .reduce((sum, line) => sum + line.amount, 0),
    );
    const principal = round2(
      allocation
        .filter((line) => line.periodNo === item.row.period_no && line.bucket === "PRINCIPAL")
        .reduce((sum, line) => sum + line.amount, 0),
    );

    if (penalty === 0 && interest === 0 && principal === 0) {
      const stillOwed = round2(item.interestOutstanding + item.principalOutstanding);
      principalLeft = round2(principalLeft + item.principalOutstanding);
      if (stillOwed > 0 && item.overdue) anyOverdue = true;
      continue;
    }

    const paidInterest = round2(item.row.paid_interest + interest);
    const paidPrincipal = round2(item.row.paid_principal + principal);
    const remainingInterest = round2(item.row.interest - paidInterest);
    const remainingPrincipal = round2(item.row.principal - paidPrincipal);
    const settled = remainingInterest <= 0.005 && remainingPrincipal <= 0.005;
    const touched = true;

    principalLeft = round2(principalLeft + Math.max(0, remainingPrincipal));
    if (!settled && remainingPrincipal > 0 && item.overdue) anyOverdue = true;

    await updateItem("loan_schedule", item.row.id, {
      paid_interest: paidInterest,
      paid_principal: paidPrincipal,
      penalty_accrued: round2(item.row.penalty_accrued + item.penalty),
      status: settled ? "PAID" : touched ? "PARTLY_PAID" : item.row.status,
      paid_on: settled ? body.paymentDate : null,
      updated_at: now,
      updated_by: actorId,
    });
  }

  const advanceBalance = round2(loan.advance_balance + totals.advance);
  const paidOff = principalLeft <= 0.005;
  await updateItem("loan", loan.id, {
    advance_balance: advanceBalance,
    status: paidOff ? "PAID_OFF" : anyOverdue ? "OVERDUE" : "CURRENT",
    closed_at: paidOff ? now : null,
    updated_at: now,
    updated_by: actorId,
  });

  const lines: JournalLine[] = [];
  if (totals.penalty > 0) lines.push({ coa_id: gl.PENALTY_EXPENSE, memo: "Late payment penalty", debit: totals.penalty, credit: 0 });
  if (totals.interest > 0) lines.push({ coa_id: gl.ACCRUED_INTEREST, memo: "Interest paid", debit: totals.interest, credit: 0 });
  if (totals.principal > 0) lines.push({ coa_id: gl.LOAN_PRINCIPAL, memo: "Principal repaid", debit: totals.principal, credit: 0 });
  if (totals.advance > 0) lines.push({ coa_id: gl.ADVANCE_TO_LENDER, memo: "Held as advance", debit: totals.advance, credit: 0 });
  if (bankCharge > 0) {
    lines.push({ coa_id: gl.BANK_CHARGE, memo: `Bank charge on ${paymentNo}`, debit: bankCharge, credit: 0 });
  }
  lines.push({ coa_id: account.coa_id, memo: `Payment ${paymentNo}`, debit: 0, credit: round2(body.amount + bankCharge) });

  const entryId = await postJournal(
    loan.id,
    body.paymentDate,
    `Loan payment ${paymentNo} · ${loan.loan_no}`,
    lines,
    now,
    actorId,
  );

  await updateItem("loan_payment", payment.id, {
    journal_entry_id: entryId,
    updated_at: now,
    updated_by: actorId,
  });

  await createItem("loan_event", {
    loan_id: loan.id,
    kind: "PAYMENT",
    occurred_at: `${body.paymentDate}T00:00:00`,
    description:
      bankCharge > 0
        ? `Payment ${paymentNo} of ₱${body.amount.toFixed(2)} recorded, plus ₱${bankCharge.toFixed(2)} bank charge.`
        : `Payment ${paymentNo} of ₱${body.amount.toFixed(2)} recorded.`,
    amount: body.amount,
    reference: paymentNo,
    actor_id: actorId,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });

  return { ...payment, journal_entry_id: entryId };
}

export async function listPayments(filters: {
  q?: string;
  loanId?: number;
  method?: string;
  status?: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: PaymentListRow[]; total: number; summary: PaymentsSummary }> {
  const filter: Record<string, unknown> = {};
  if (filters.loanId) filter.loan_id = { _eq: filters.loanId };
  if (filters.method) filter.method = { _eq: filters.method };
  if (filters.status) filter.status = { _eq: filters.status };
  if (filters.q) {
    filter._or = [
      { payment_no: { _contains: filters.q } },
      { check_no: { _contains: filters.q } },
      { lender_receipt: { _contains: filters.q } },
    ];
  }

  const { rows, total } = await listItems<LoanPaymentRow>("loan_payment", {
    fields: PAYMENT_FIELDS,
    filter,
    sort: "-payment_date,-id",
    limit: filters.pageSize,
    page: filters.page,
  });

  const loanIds = [...new Set(rows.map((row) => row.loan_id))];
  const paymentIds = rows.map((row) => row.id);

  const loans = loanIds.length
    ? (await listItems<{ id: number; loan_no: string; lender_name: string }>("loan", {
        fields: ["id", "loan_no", "lender_name"],
        filter: { id: { _in: loanIds } },
        limit: loanIds.length,
      })).rows
    : [];
  const accounts = await listPaymentAccounts();
  const entries = rows.some((row) => row.journal_entry_id)
    ? (await listItems<{ id: number; entry_no: string }>("loan_journal_entry", {
        fields: ["id", "entry_no"],
        filter: { id: { _in: rows.filter((row) => row.journal_entry_id).map((row) => row.journal_entry_id) } },
        limit: rows.length,
      })).rows
    : [];
  const allocations = paymentIds.length
    ? (await listItems<AllocationRow>("loan_payment_allocation", {
        fields: ["id", "payment_id", "installment_id", "bucket", "amount"],
        filter: { payment_id: { _in: paymentIds } },
        limit: paymentIds.length * 6,
      })).rows
    : [];

  const loanLabel = new Map(loans.map((loan) => [loan.id, loan]));
  const accountLabel = new Map(accounts.map((item) => [item.id, item.name]));
  const entryLabel = new Map(entries.map((entry) => [entry.id, entry.entry_no]));

  const list: PaymentListRow[] = rows.map((rawRow) => {
    const row = {
      ...rawRow,
      loan_id: num(rawRow.loan_id),
      amount: num(rawRow.amount),
      account_id: num(rawRow.account_id),
      charge_amount: num(rawRow.charge_amount),
    bank_charge: num(rawRow.bank_charge),
      advance_created: num(rawRow.advance_created),
      journal_entry_id: rawRow.journal_entry_id === null ? null : num(rawRow.journal_entry_id),
    };
    const own = allocations
      .filter((line) => num(line.payment_id) === row.id)
      .map((line) => ({ ...line, amount: num(line.amount), installment_id: line.installment_id === null ? null : num(line.installment_id) }));
    const sum = (bucket: string) => round2(own.filter((line) => line.bucket === bucket).reduce((total, line) => total + line.amount, 0));
    return {
      ...row,
      loan_no: loanLabel.get(row.loan_id)?.loan_no ?? null,
      lenderName: loanLabel.get(row.loan_id)?.lender_name ?? null,
      accountLabel: accountLabel.get(row.account_id) ?? null,
      entryNo: row.journal_entry_id ? entryLabel.get(row.journal_entry_id) ?? null : null,
      penaltyAmount: sum("PENALTY"),
      interestAmount: sum("INTEREST"),
      principalAmount: sum("PRINCIPAL"),
      advanceAmount: sum("ADVANCE"),
    };
  });

  const thisMonth = phtStamp().slice(0, 7);
  // The header describes the book, not the page: computing it from `list` made every figure
  // change when the reader turned a page.
  const booked = (await listItems<{ status: string; payment_date: string; amount: number; charge_amount: number }>(
    "loan_payment",
    { fields: ["status", "payment_date", "amount", "charge_amount"], filter: { status: { _eq: "POSTED" } }, limit: 5000 },
  )).rows;
  const advances = (await listItems<{ advance_balance: number }>("loan", {
    fields: ["advance_balance"],
    limit: 1000,
  })).rows;
  const summary: PaymentsSummary = {
    posted: booked.length,
    amountThisMonth: round2(
      booked
        .filter((row) => String(row.payment_date ?? "").slice(0, 10).startsWith(thisMonth))
        .reduce((sum, row) => sum + num(row.amount), 0),
    ),
    penaltyCharged: round2(booked.reduce((sum, row) => sum + num(row.charge_amount), 0)),
    advanceHeld: round2(advances.reduce((sum, loan) => sum + num(loan.advance_balance), 0)),
  };

  return { rows: list, total, summary };
}

export async function getPayment(id: number): Promise<{ payment: PaymentListRow; allocations: AllocationRow[]; reversible: { allowed: boolean; reason: string | null } }> {
  const { rows } = await listItems<LoanPaymentRow>("loan_payment", {
    fields: PAYMENT_FIELDS,
    filter: { id: { _eq: id } },
    limit: 1,
  });
  const raw = rows[0];
  if (!raw) throw new LoanNotFoundError("That payment does not exist.");

  // DECIMAL columns arrive as strings; the reversal builds a journal from these, and a string
  // debit turns the entry totals into NaN, which the database rejects as null.
  const payment = {
    ...raw,
    amount: num(raw.amount),
    charge_amount: num(raw.charge_amount),
    bank_charge: num(raw.bank_charge),
    advance_created: num(raw.advance_created),
  };

  const allocations = (
    await listItems<AllocationRow>("loan_payment_allocation", {
      fields: ["id", "payment_id", "installment_id", "bucket", "amount"],
      filter: { payment_id: { _eq: id } },
      sort: "id",
      limit: 50,
    })
  ).rows.map((line) => ({ ...line, amount: num(line.amount) }));

  const { rows: loanRows } = await listItems<{ id: number; loan_no: string; lender_name: string }>("loan", {
    fields: ["id", "loan_no", "lender_name"],
    filter: { id: { _eq: payment.loan_id } },
    limit: 1,
  });
  const accounts = await listPaymentAccounts();
  const sum = (bucket: string) => round2(allocations.filter((line) => line.bucket === bucket).reduce((total, line) => total + line.amount, 0));
  const entryNo = payment.journal_entry_id
    ? ((
        await listItems<{ entry_no: string }>("loan_journal_entry", {
          fields: ["entry_no"],
          filter: { id: { _eq: payment.journal_entry_id } },
          limit: 1,
        })
      ).rows[0]?.entry_no ?? null)
    : null;

  return {
    payment: {
      ...payment,
      loan_no: loanRows[0]?.loan_no ?? null,
      lenderName: loanRows[0]?.lender_name ?? null,
      accountLabel: accounts.find((item) => item.id === payment.account_id)?.name ?? null,
      entryNo,
      penaltyAmount: sum("PENALTY"),
      interestAmount: sum("INTEREST"),
      principalAmount: sum("PRINCIPAL"),
      advanceAmount: sum("ADVANCE"),
    },
    allocations,
    reversible: await reversalCheck(payment),
  };
}

/**
 * Why a payment may not be reversed, in the same words the service refuses with.
 * The dialog disables the button on this, so the reader is not offered a 409 as the answer.
 */
async function reversalCheck(payment: {
  id: number;
  loan_id: number;
  payment_no: string;
  status: string;
}): Promise<{ allowed: boolean; reason: string | null }> {
  if (payment.status === "REVERSED") {
    return { allowed: false, reason: `${payment.payment_no} is already reversed.` };
  }
  const later = (
    await listItems<{ payment_no: string }>("loan_payment", {
      fields: ["payment_no"],
      filter: {
        loan_id: { _eq: payment.loan_id },
        id: { _gt: payment.id },
        status: { _eq: "POSTED" },
      },
      sort: "-id",
      limit: 1,
    })
  ).rows[0];
  if (later) {
    return {
      allowed: false,
      reason: `${later.payment_no} was recorded after this one, so this payment cannot be reversed first. Reverse the newest payment instead.`,
    };
  }
  return { allowed: true, reason: null };
}

/**
 * Reverses a payment by mirroring its journal entry and undoing the schedule amounts it applied.
 *
 * Only the newest payment on a loan may be reversed: undoing an older one would leave later
 * allocations applied to installments whose paid amounts no longer add up.
 */
export async function reversePayment(id: number, actorId: number | null): Promise<LoanPaymentRow> {
  const { payment, allocations } = await getPayment(id);
  if (payment.status === "REVERSED") {
    throw new LoanConflictError(`Payment ${payment.payment_no} is already reversed.`);
  }

  const later = await listItems<{ id: number }>("loan_payment", {
    fields: ["id"],
    filter: {
      _and: [
        { loan_id: { _eq: payment.loan_id } },
        { status: { _eq: "POSTED" } },
        { id: { _gt: id } },
      ],
    },
    limit: 1,
  });
  if (later.total > 0) {
    throw new LoanConflictError(
      "A later payment exists on this loan, so this one cannot be reversed. Reverse the newest payment first.",
    );
  }

  const loan = await getLoanRow(payment.loan_id);
  await assertNotLocked(payment.payment_date);

  const now = phtStamp();
  const gl = await loadGlMapping(
    payment.bank_charge > 0
      ? ["LOAN_PRINCIPAL", "ACCRUED_INTEREST", "PENALTY_EXPENSE", "ADVANCE_TO_LENDER", "BANK_CHARGE"]
      : ["LOAN_PRINCIPAL", "ACCRUED_INTEREST", "PENALTY_EXPENSE", "ADVANCE_TO_LENDER"],
  );
  const reverseNo = await nextNumber("loan_journal_entry", "entry_no", "LJE");

  const lines: JournalLine[] = [
    { coa_id: gl.PENALTY_EXPENSE, memo: `Reverse penalty ${payment.payment_no}`, debit: 0, credit: payment.penaltyAmount },
    { coa_id: gl.ACCRUED_INTEREST, memo: `Reverse interest ${payment.payment_no}`, debit: 0, credit: payment.interestAmount },
    { coa_id: gl.LOAN_PRINCIPAL, memo: `Reverse principal ${payment.payment_no}`, debit: 0, credit: payment.principalAmount },
    { coa_id: gl.ADVANCE_TO_LENDER, memo: `Reverse advance ${payment.payment_no}`, debit: 0, credit: payment.advanceAmount },
  ].filter((line) => line.credit > 0);
  if (payment.bank_charge > 0) {
    lines.push({
      coa_id: gl.BANK_CHARGE,
      memo: `Reverse bank charge ${payment.payment_no}`,
      debit: 0,
      credit: payment.bank_charge,
    });
  }
  lines.push({
    coa_id: (await listPaymentAccounts()).find((item) => item.id === payment.account_id)?.coa_id ?? 0,
    memo: `Reverse ${payment.payment_no}`,
    debit: round2(payment.amount + payment.bank_charge),
    credit: 0,
  });

  const entryNo = reverseNo;
  const entry = await createItem<{ id: number }>("loan_journal_entry", {
    loan_id: payment.loan_id,
    entry_no: entryNo,
    entry_date: payment.payment_date,
    entry_type: "PAYMENT",
    description: `Reversal of ${payment.payment_no} · ${payment.loan_no ?? ""}`.trim(),
    period_key: payment.payment_date.slice(0, 7),
    status: "POSTED",
    reverses_entry_no: payment.journal_entry_id
      ? (await listItems<{ entry_no: string }>("loan_journal_entry", {
          fields: ["entry_no"],
          filter: { id: { _eq: payment.journal_entry_id } },
          limit: 1,
        })).rows[0]?.entry_no ?? null
      : null,
    total_debit: round2(lines.reduce((sum, line) => sum + line.debit, 0)),
    total_credit: round2(lines.reduce((sum, line) => sum + line.credit, 0)),
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
      coa_id: line.coa_id,
      memo: line.memo,
      debit: line.debit,
      credit: line.credit,
      created_at: now,
      created_by: actorId,
      updated_at: now,
      updated_by: actorId,
    })),
  );

  const schedule = await getSchedule(loan);
  const byId = new Map(schedule.map((row) => [row.id, row]));
  for (const line of allocations) {
    if (line.installment_id === null) continue;
    const row = byId.get(line.installment_id);
    if (!row) continue;
    const paidInterest = line.bucket === "INTEREST" ? round2(row.paid_interest - line.amount) : row.paid_interest;
    const paidPrincipal = line.bucket === "PRINCIPAL" ? round2(row.paid_principal - line.amount) : row.paid_principal;
    const remainingInterest = round2(row.interest - paidInterest);
    const remainingPrincipal = round2(row.principal - paidPrincipal);
    await updateItem("loan_schedule", row.id, {
      paid_interest: paidInterest,
      paid_principal: paidPrincipal,
      status: remainingInterest <= 0.005 && remainingPrincipal <= 0.005 ? "PAID" : paidInterest + paidPrincipal > 0 ? "PARTLY_PAID" : "UPCOMING",
      paid_on: null,
      updated_at: now,
      updated_by: actorId,
    });
  }

  await updateItem("loan_payment", payment.id, {
    status: "REVERSED",
    reversed_by_id: entry.id,
    updated_at: now,
    updated_by: actorId,
  });

  await updateItem("loan", loan.id, {
    advance_balance: round2(loan.advance_balance - payment.advanceAmount),
    status: "CURRENT",
    closed_at: null,
    updated_at: now,
    updated_by: actorId,
  });

  await createItem("loan_event", {
    loan_id: loan.id,
    kind: "PAYMENT_REVERSED",
    occurred_at: now,
    description: `Payment ${payment.payment_no} reversed.`,
    amount: payment.amount,
    reference: payment.payment_no,
    actor_id: actorId,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });

  return { ...payment, status: "REVERSED", reversed_by_id: entry.id };
}

export type { InstallmentRow };
