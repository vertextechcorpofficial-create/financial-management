import "server-only";

import { asBoolean, asNumber, asNumberOrNull, asString, createItem, createItems, listItems } from "./directus";
import { LoanNotFoundError, LoanValidationError } from "./errors";
import {
  documentaryStampTax,
  daysBetween,
  previewLoan,
  type BusinessDayRule,
  type DstTreatment,
  type FirstPeriodBasis,
  type PaymentFrequency,
  type RepaymentMethod,
  type Security,
  type ScheduleRow,
  type AmortizedRow,
} from "./loanEngine";
import { phtStamp } from "../pht";
import type { LoanBody } from "../schemas";
import type {
  LoanListRow,
  LoanPaymentAccountRow,
  LoanRow,
  LoanScheduleRow,
  RegisterSummary,
} from "../types";

const LOAN_FIELDS = [
  "id",
  "loan_no",
  "lender_name",
  "lender_type",
  "branch",
  "account_officer",
  "contact_phone",
  "contact_email",
  "account_no",
  "purpose",
  "security",
  "security_value",
  "guarantor",
  "principal",
  "nominal_rate",
  "current_rate",
  "rate_type",
  "repayment_method",
  "payment_frequency",
  "term_payments",
  "release_date",
  "first_payment_date",
  "first_period_basis",
  "business_day_rule",
  "proceeds_account_id",
  "processing_fee",
  "dst_treatment",
  "dst_amount",
  "other_costs",
  "penalty_rate_monthly",
  "grace_days",
  "pas23_applies",
  "pas23_borrowing_type",
  "pas23_asset",
  "pas23_capitalize_from",
  "pas23_capitalize_until",
  "installment_amount",
  "proceeds_net",
  "eir_rate",
  "maturity_date",
  "approval_status",
  "status",
  "schedule_version",
  "advance_balance",
  "submitted_at",
  "submitted_by",
  "approved_at",
  "approved_by",
  "released_at",
  "closed_at",
  "remarks",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
];

const SCHEDULE_FIELDS = [
  "loan_id",
  "version",
  "period_no",
  "payment_due_date",
  "principal",
  "paid_principal",
  "penalty_accrued",
  "paid_penalty",
  "status",
];

interface ScheduleSlice {
  loan_id: number;
  version: number;
  period_no: number;
  payment_due_date: string;
  principal: number;
  paid_principal: number;
  penalty_accrued: number;
  paid_penalty: number;
  status: LoanScheduleRow["status"];
}

/** Directus hands DECIMAL columns back as strings, so every money read goes through asNumber. */
function toLoanRow(raw: Record<string, unknown>): LoanRow {
  return raw as unknown as LoanRow;
}

export function mapLoan(raw: Record<string, unknown>): LoanRow {
  const row = toLoanRow(raw);
  return {
    ...row,
    principal: asNumber(raw.principal),
    nominal_rate: asNumber(raw.nominal_rate),
    current_rate: asNumber(raw.current_rate),
    security_value: asNumberOrNull(raw.security_value),
    processing_fee: asNumber(raw.processing_fee),
    dst_amount: asNumber(raw.dst_amount),
    other_costs: asNumber(raw.other_costs),
    penalty_rate_monthly: asNumber(raw.penalty_rate_monthly),
    grace_days: asNumber(raw.grace_days),
    pas23_applies: asBoolean(raw.pas23_applies),
    installment_amount: asNumber(raw.installment_amount),
    proceeds_net: asNumber(raw.proceeds_net),
    eir_rate: asNumber(raw.eir_rate),
    schedule_version: asNumber(raw.schedule_version, 1),
    advance_balance: asNumber(raw.advance_balance),
    term_payments: asNumber(raw.term_payments),
    proceeds_account_id: asNumber(raw.proceeds_account_id),
  };
}

export async function listPaymentAccounts(): Promise<LoanPaymentAccountRow[]> {
  const { rows } = await listItems<Record<string, unknown>>("loan_payment_account", {
    fields: ["id", "name", "kind", "coa_id", "charge_pct", "is_active", "sort"],
    sort: "sort,id",
    limit: 100,
  });
  return rows.map((row) => ({
    id: asNumber(row.id),
    name: asString(row.name),
    kind: (asString(row.kind) || "BANK") as LoanPaymentAccountRow["kind"],
    coa_id: asNumber(row.coa_id),
    charge_pct: asNumber(row.charge_pct),
    is_active: asBoolean(row.is_active),
    sort: asNumber(row.sort),
  }));
}

/** Holidays in the booking table plus the built-in Philippine set is the calendar's job; this
 * only returns what accounting maintains, because a loan's due dates must follow the booked list. */
export async function listHolidays(): Promise<string[]> {
  const { rows } = await listItems<Record<string, unknown>>("loan_holiday", {
    fields: ["holiday_date"],
    sort: "holiday_date",
    limit: 500,
  });
  return rows.map((row) => asString(row.holiday_date).slice(0, 10)).filter(Boolean);
}

function scheduleByLoan(rows: ScheduleSlice[]): Map<number, ScheduleSlice[]> {
  const map = new Map<number, ScheduleSlice[]>();
  for (const row of rows) {
    const list = map.get(row.loan_id);
    if (list) list.push(row);
    else map.set(row.loan_id, [row]);
  }
  return map;
}

export interface RegisterQuery {
  q?: string;
  status?: string;
  lenderType?: string;
  page: number;
  pageSize: number;
}

export async function loadRegister(query: RegisterQuery): Promise<{ rows: LoanListRow[]; total: number }> {
  const conditions: Record<string, unknown>[] = [];
  if (query.q) {
    conditions.push({
      _or: [
        { loan_no: { _icontains: query.q } },
        { lender_name: { _icontains: query.q } },
        { account_no: { _icontains: query.q } },
        { purpose: { _icontains: query.q } },
      ],
    });
  }
  if (query.status) conditions.push({ status: { _eq: query.status } });
  if (query.lenderType) conditions.push({ lender_type: { _eq: query.lenderType } });

  const filter = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : { _and: conditions };

  const { rows, total } = await listItems<Record<string, unknown>>("loan", {
    fields: LOAN_FIELDS,
    filter,
    sort: "-created_at",
    limit: query.pageSize,
    page: query.page,
  });

  const loans = rows.map(mapLoan);
  const accounts = await listPaymentAccounts();
  const accountLabel = new Map(accounts.map((account) => [account.id, account.name]));

  let schedules = new Map<number, ScheduleSlice[]>();
  if (loans.length > 0) {
    const { rows: scheduleRows } = await listItems<Record<string, unknown>>("loan_schedule", {
      fields: SCHEDULE_FIELDS,
      filter: { loan_id: { _in: loans.map((loan) => loan.id) } },
      limit: loans.length * 600,
    });
    schedules = scheduleByLoan(
      scheduleRows.map((row) => ({
        loan_id: asNumber(row.loan_id),
        version: asNumber(row.version, 1),
        period_no: asNumber(row.period_no),
        payment_due_date: asString(row.payment_due_date).slice(0, 10),
        principal: asNumber(row.principal),
        paid_principal: asNumber(row.paid_principal),
        penalty_accrued: asNumber(row.penalty_accrued),
        paid_penalty: asNumber(row.paid_penalty),
        status: asString(row.status) as LoanScheduleRow["status"],
      })),
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const listRows: LoanListRow[] = loans.map((loan) => {
    const schedule = (schedules.get(loan.id) ?? []).filter((row) => row.version === loan.schedule_version);
    const outstanding = schedule.length
      ? schedule.reduce((sum, row) => sum + Math.max(0, row.principal - row.paid_principal), 0)
      : loan.principal;
    const paidToDate = schedule.length
      ? schedule.reduce((sum, row) => sum + row.paid_principal, 0)
      : 0;
    const open = schedule
      .filter((row) => row.principal - row.paid_principal > 0.005)
      .sort((a, b) => a.payment_due_date.localeCompare(b.payment_due_date));
    const next = open[0] ?? null;
    const overdue = open.filter((row) => row.payment_due_date < today);
    // A loan the board rejected, or one not released yet, owes nothing: printing a next due
    // date for it reads as a demand the desk should not act on.
    const owesNothing = !loan.released_at || loan.status === "REJECTED" || loan.status === "PAID_OFF" || loan.status === "PREPAID";

    return {
      ...loan,
      proceedsAccountLabel: accountLabel.get(loan.proceeds_account_id) ?? null,
      outstandingPrincipal: owesNothing ? 0 : Math.round(outstanding * 100) / 100,
      paidToDate: Math.round(paidToDate * 100) / 100,
      nextDueDate: owesNothing ? null : (next?.payment_due_date ?? null),
      nextDueAmount: owesNothing || !next ? null : Math.round((next.principal - next.paid_principal + next.penalty_accrued - next.paid_penalty) * 100) / 100,
      status: overdue.length > 0 && loan.status === "CURRENT" ? "OVERDUE" : loan.status,
    };
  });

  return { rows: listRows, total };
}

export async function loadSummary(): Promise<RegisterSummary> {
  const { rows } = await listItems<Record<string, unknown>>("loan", {
    fields: ["id", "status", "approval_status", "principal", "nominal_rate", "advance_balance", "schedule_version"],
    limit: 1000,
  });
  const loans = rows.map(mapLoan);

  const monthKey = new Date().toISOString().slice(0, 7);
  let dueThisMonth = 0;
  let overdueAmount = 0;
  let totalPrincipal = 0;
  let weighted = 0;
  const remainingPrincipal = new Map<number, number>();

  if (loans.length > 0) {
    const { rows: scheduleRows } = await listItems<Record<string, unknown>>("loan_schedule", {
      fields: [
        "loan_id",
        "version",
        "payment_due_date",
        "principal",
        "interest",
        "penalty_accrued",
        "paid_principal",
        "paid_interest",
        "paid_penalty",
        "status",
      ],
      filter: { status: { _nin: ["PAID"] } },
      limit: 5000,
    });
    const versions = new Map(loans.map((loan) => [loan.id, loan.schedule_version]));
    const today = new Date().toISOString().slice(0, 10);
    for (const raw of scheduleRows) {
      const loanId = asNumber(raw.loan_id);
      if (versions.get(loanId) !== asNumber(raw.version, 1)) continue;
      // An installment is money, not principal: what the borrower owes on that date is
      // principal + interest (+ penalty already accrued) less whatever has been paid.
      const dueMoney =
        asNumber(raw.principal) +
        asNumber(raw.interest) +
        asNumber(raw.penalty_accrued) -
        asNumber(raw.paid_principal) -
        asNumber(raw.paid_interest) -
        asNumber(raw.paid_penalty);
      if (dueMoney <= 0.005) continue;
      const due = asString(raw.payment_due_date).slice(0, 10);
      if (due.slice(0, 7) === monthKey) dueThisMonth += dueMoney;
      if (due < today) overdueAmount += dueMoney;
      // What is still owed is principal that has not been repaid, not the amount borrowed:
      // a loan half paid off must not count at its original face value.
      remainingPrincipal.set(loanId, (remainingPrincipal.get(loanId) ?? 0) + asNumber(raw.principal) - asNumber(raw.paid_principal));
    }
  }

  for (const loan of loans) {
    if (loan.status === "CURRENT" || loan.status === "OVERDUE") {
      const outstanding = remainingPrincipal.get(loan.id) ?? 0;
      totalPrincipal += outstanding;
      weighted += outstanding * loan.nominal_rate;
    }
  }

  const round = (value: number) => Math.round(value * 100) / 100;

  return {
    totals: {
      loans: loans.length,
      current: loans.filter((loan) => loan.status === "CURRENT" || loan.status === "OVERDUE").length,
      pendingReview: loans.filter((loan) => loan.approval_status === "PENDING").length,
      outstandingPrincipal: round(totalPrincipal),
      dueThisMonth: round(dueThisMonth),
      overdueAmount: round(overdueAmount),
      weightedRate: totalPrincipal > 0 ? Math.round((weighted / totalPrincipal) * 10000) / 10000 : null,
    },
    accounts: await listPaymentAccounts(),
    notices: [],
  };
}

async function nextLoanNo(year: number): Promise<string> {
  const prefix = `LP-${year}-`;
  const { total } = await listItems<Record<string, unknown>>("loan", {
    fields: ["id"],
    filter: { loan_no: { _starts_with: prefix } },
    limit: 1,
  });
  return `${prefix}${String(total + 1).padStart(4, "0")}`;
}

export interface LoanComputation {
  dstAmount: number;
  installmentAmount: number;
  proceedsNet: number;
  /** Annual effective rate as a decimal fraction: 0.108949249 means 10.89% a year. */
  eirRate: number;
  maturityDate: string;
  totalInterest: number;
  /** The contractual amortisation, plus the carrying-value columns the schedule table stores. */
  schedule: ScheduleRow[];
  amortized: AmortizedRow[];
}

/**
 * Derives the figures the register stores beside the inputs.
 *
 * `eir_rate` holds the annual effective rate as a fraction, not a percentage, so the column's
 * nine decimals are enough for the smallest realistic rate and no caller has to remember which
 * convention it is in.
 */
export async function computeLoan(body: LoanBody): Promise<LoanComputation> {
  const holidays = await listHolidays();
  const scheduleInput = {
    principal: body.principal,
    annualRate: body.annualRate,
    termPayments: body.termPayments,
    repaymentMethod: body.repaymentMethod as RepaymentMethod,
    paymentFrequency: body.paymentFrequency as PaymentFrequency,
    releaseDate: body.releaseDate,
    firstPaymentDate: body.firstPaymentDate,
    firstPeriodBasis: body.firstPeriodBasis as FirstPeriodBasis,
    businessDayRule: body.businessDayRule as BusinessDayRule,
    holidays,
  };

  // The tax is prorated by the loan's actual running time, and the tax changes the net proceeds,
  // so the schedule is built once to learn the maturity date before the amount is fixed.
  const schedulePreview = previewLoan({
    ...scheduleInput,
    processingFee: body.processingFee,
    dstAmount: 0,
    dstTreatment: body.dstTreatment as DstTreatment,
    otherCosts: body.otherCosts,
  });
  const termDays = Math.max(0, daysBetween(body.releaseDate, schedulePreview.maturityDate));
  const dstAmount =
    body.dstTreatment === "NOT_APPLICABLE"
      ? 0
      : documentaryStampTax(body.principal, termDays, body.security as Security);

  const preview = previewLoan({
    ...scheduleInput,
    processingFee: body.processingFee,
    dstAmount,
    dstTreatment: body.dstTreatment as DstTreatment,
    otherCosts: body.otherCosts,
  });

  return {
    dstAmount,
    installmentAmount: preview.installmentAmount,
    proceedsNet: preview.netProceeds,
    eirRate: Math.round(preview.effectiveAnnualRate * 1e9) / 1e9,
    maturityDate: preview.maturityDate,
    totalInterest: preview.totalInterest,
    schedule: preview.schedule,
    amortized: preview.amortized,
  };
}

/**
 * Persists the amortisation the loan was approved with. The bail-out that motivated this
 * function: a loan row without schedule rows shows an installment nobody can pay against, so
 * the schedule is written in the same request that creates the loan.
 */
async function writeSchedule(
  loanId: number,
  version: number,
  computation: LoanComputation,
  now: string,
  actorId: number | null,
): Promise<void> {
  const rows = computation.schedule.map((row, index) => {
    const carrying = computation.amortized[index];
    return {
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
      open_carrying: carrying ? carrying.openingCarrying : row.openingPrincipal,
      eir_interest: carrying ? carrying.interestExpense : row.interest,
      cost_amortization: carrying ? carrying.costAmortization : 0,
      close_carrying: carrying ? carrying.closingCarrying : row.closingPrincipal,
      flat_interest: row.flatInterest,
      rule78_interest: row.rule78Interest,
      penalty_accrued: 0,
      paid_penalty: 0,
      paid_interest: 0,
      paid_principal: 0,
      status: "UPCOMING",
      paid_on: null,
      is_restated: false,
      created_at: now,
      created_by: actorId,
      updated_at: now,
      updated_by: actorId,
    };
  });

  if (rows.length > 0) await createItems("loan_schedule", rows);
}

export async function createLoan(body: LoanBody, actorId: number | null): Promise<LoanRow> {
  const accounts = await listPaymentAccounts();
  const account = accounts.find((item) => item.id === body.proceedsAccountId);
  if (!account) {
    throw new LoanValidationError("Choose the account that received the money.", {
      proceedsAccountId: ["That account is not in the payment account list."],
    });
  }

  const computation = await computeLoan(body);
  const year = Number(body.releaseDate.slice(0, 4));
  const now = phtStamp();

  const payload: Record<string, unknown> = {
    loan_no: await nextLoanNo(year),
    lender_name: body.lenderName,
    lender_type: body.lenderType,
    branch: body.branch || null,
    account_officer: body.accountOfficer || null,
    contact_phone: body.contactPhone || null,
    contact_email: body.contactEmail || null,
    account_no: body.accountNo,
    purpose: body.purpose,
    security: body.security,
    security_value: body.securityValue ?? null,
    guarantor: body.guarantor || null,
    principal: body.principal,
    nominal_rate: body.annualRate,
    current_rate: body.annualRate,
    rate_type: body.rateType,
    repayment_method: body.repaymentMethod,
    payment_frequency: body.paymentFrequency,
    term_payments: body.termPayments,
    release_date: body.releaseDate,
    first_payment_date: body.firstPaymentDate,
    first_period_basis: body.firstPeriodBasis,
    business_day_rule: body.businessDayRule,
    proceeds_account_id: body.proceedsAccountId,
    processing_fee: body.processingFee,
    dst_treatment: body.dstTreatment,
    dst_amount: computation.dstAmount,
    other_costs: body.otherCosts,
    penalty_rate_monthly: body.penaltyRateMonthly,
    grace_days: body.graceDays,
    pas23_applies: body.pas23Applies,
    pas23_borrowing_type: body.pas23Applies ? body.pas23BorrowingType ?? null : null,
    pas23_asset: body.pas23Applies ? body.pas23Asset || null : null,
    pas23_capitalize_from: body.pas23Applies ? body.pas23CapitalizeFrom || null : null,
    pas23_capitalize_until: body.pas23Applies ? body.pas23CapitalizeUntil || null : null,
    installment_amount: computation.installmentAmount,
    proceeds_net: computation.proceedsNet,
    eir_rate: computation.eirRate,
    maturity_date: computation.maturityDate,
    approval_status: "PENDING",
    status: "PENDING_APPROVAL",
    schedule_version: 1,
    advance_balance: 0,
    submitted_at: now,
    submitted_by: actorId,
    remarks: body.remarks || null,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  };

  const created = await createItem<Record<string, unknown>>("loan", payload);
  const loan = mapLoan(created);

  await writeSchedule(loan.id, loan.schedule_version, computation, now, actorId);

  await createItem<Record<string, unknown>>("loan_approval", {
    loan_id: loan.id,
    action: "SUBMITTED",
    remarks: body.remarks || null,
    actor_id: actorId,
    acted_at: now,
    self_approved: false,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });

  await createItem<Record<string, unknown>>("loan_event", {
    loan_id: loan.id,
    kind: "SUBMITTED",
    occurred_at: now,
    description: `Submitted for approval: ${loan.loan_no} · ${loan.lender_name}`,
    amount: loan.principal,
    reference: loan.loan_no,
    actor_id: actorId,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });

  return loan;
}

export async function getLoan(id: number): Promise<LoanRow> {
  const { rows } = await listItems<Record<string, unknown>>("loan", {
    fields: LOAN_FIELDS,
    filter: { id: { _eq: id } },
    limit: 1,
  });
  const row = rows[0];
  if (!row) throw new LoanNotFoundError("That loan does not exist.");
  return mapLoan(row);
}


