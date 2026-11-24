import "server-only";

import {
  agingFromRows,
  currentPortionFromRows,
  deriveLoanStatus,
  emptyBuckets,
  mergeBuckets,
  outstandingOf,
  tieFor,
  totalsFromRows,
} from "./aging";
import { asBoolean, asNumber, asString, createItem, listItems, updateItem } from "./directus";
import { LoanNotFoundError } from "./errors";
import { kpisFromRows } from "./kpis";
import { daysBetween, round2 } from "./loanEngine";
import { planRefresh } from "./refreshPlan";
import { phtStamp, phtToday } from "../pht";
import type {
  AgingBuckets,
  LoanAgingRow,
  LoanScheduleRow,
  LoanStatus,
  PaymentFrequency,
  RateType,
  RefreshResult,
  RepaymentMethod,
  ScheduleLoanEntry,
  SchedulePayload,
} from "../types";

const LOAN_FIELDS = [
  "id",
  "loan_no",
  "lender_name",
  "account_no",
  "principal",
  "nominal_rate",
  "current_rate",
  "rate_type",
  "repayment_method",
  "payment_frequency",
  "release_date",
  "maturity_date",
  "eir_rate",
  "status",
  "schedule_version",
  "grace_days",
  "term_payments",
  "installment_amount",
];

const HOLIDAYS = "loan_holiday";

const SCHEDULE_FIELDS = [
  "id",
  "loan_id",
  "version",
  "period_no",
  "due_date",
  "payment_due_date",
  "opening_principal",
  "interest",
  "principal",
  "payment",
  "closing_principal",
  "open_carrying",
  "eir_interest",
  "cost_amortization",
  "close_carrying",
  "flat_interest",
  "rule78_interest",
  "penalty_accrued",
  "paid_penalty",
  "paid_interest",
  "paid_principal",
  "status",
  "paid_on",
  "is_restated",
];

/** Money arrives as DECIMAL strings, so every figure the screen adds up goes through asNumber. */
function mapScheduleRow(raw: Record<string, unknown>): LoanScheduleRow {
  return {
    id: asNumber(raw.id),
    loan_id: asNumber(raw.loan_id),
    version: asNumber(raw.version, 1),
    period_no: asNumber(raw.period_no),
    due_date: asString(raw.due_date).slice(0, 10),
    payment_due_date: asString(raw.payment_due_date).slice(0, 10),
    opening_principal: asNumber(raw.opening_principal),
    interest: asNumber(raw.interest),
    principal: asNumber(raw.principal),
    payment: asNumber(raw.payment),
    closing_principal: asNumber(raw.closing_principal),
    open_carrying: asNumber(raw.open_carrying),
    eir_interest: asNumber(raw.eir_interest),
    cost_amortization: asNumber(raw.cost_amortization),
    close_carrying: asNumber(raw.close_carrying),
    flat_interest: raw.flat_interest == null ? null : asNumber(raw.flat_interest),
    rule78_interest: raw.rule78_interest == null ? null : asNumber(raw.rule78_interest),
    penalty_accrued: asNumber(raw.penalty_accrued),
    paid_penalty: asNumber(raw.paid_penalty),
    paid_interest: asNumber(raw.paid_interest),
    paid_principal: asNumber(raw.paid_principal),
    status: (asString(raw.status) || "UPCOMING") as LoanScheduleRow["status"],
    paid_on: raw.paid_on ? asString(raw.paid_on).slice(0, 10) : null,
    is_restated: asBoolean(raw.is_restated),
  };
}

type LoanCore = Omit<ScheduleLoanEntry, "versions" | "outstandingPrincipal">;

function mapLoan(raw: Record<string, unknown>): LoanCore {
  return {
    id: asNumber(raw.id),
    loanNo: asString(raw.loan_no),
    lenderName: asString(raw.lender_name),
    accountNo: asString(raw.account_no),
    status: (asString(raw.status) || "PENDING_APPROVAL") as LoanStatus,
    principal: asNumber(raw.principal),
    nominalRate: asNumber(raw.nominal_rate),
    currentRate: asNumber(raw.current_rate),
    rateType: (asString(raw.rate_type) || "FIXED") as RateType,
    repaymentMethod: (asString(raw.repayment_method) || "ORDINARY_ANNUITY") as RepaymentMethod,
    paymentFrequency: (asString(raw.payment_frequency) || "MONTHLY") as PaymentFrequency,
    releaseDate: asString(raw.release_date).slice(0, 10),
    maturityDate: raw.maturity_date ? asString(raw.maturity_date).slice(0, 10) : null,
    eirRate: asNumber(raw.eir_rate),
    scheduleVersion: asNumber(raw.schedule_version, 1),
    graceDays: asNumber(raw.grace_days),
    termPayments: asNumber(raw.term_payments),
    installmentAmount: asNumber(raw.installment_amount),
  };
}

/**
 * `loan_holiday` as date → name, so a payment date that moved can say which day it moved off.
 * A failure here only costs the subtext, so it must not take the schedule down with it.
 */
async function holidayNames(): Promise<Record<string, string>> {
  try {
    const { rows } = await listItems<Record<string, unknown>>(HOLIDAYS, {
      fields: ["holiday_date", "name"],
      limit: -1,
    });
    const map: Record<string, string> = {};
    for (const row of rows) {
      const date = asString(row.holiday_date).slice(0, 10);
      if (date) map[date] = asString(row.name) || "Holiday";
    }
    return map;
  } catch (cause) {
    console.warn("loan-schedules: the holiday calendar could not be read", cause);
    return {};
  }
}

/** Every schedule row on the desk: the loan tables are small by design and one read beats N. */
async function readAllSchedules(): Promise<LoanScheduleRow[]> {
  const { rows } = await listItems<Record<string, unknown>>("loan_schedule", {
    fields: SCHEDULE_FIELDS,
    sort: "loan_id,version,period_no",
    limit: -1,
  });
  return rows.map(mapScheduleRow);
}

function groupByLoan(rows: readonly LoanScheduleRow[]): Map<number, LoanScheduleRow[]> {
  const map = new Map<number, LoanScheduleRow[]>();
  for (const row of rows) {
    const list = map.get(row.loan_id);
    if (list) list.push(row);
    else map.set(row.loan_id, [row]);
  }
  return map;
}

/** The rows the desk treats as a loan's live schedule: its current version, oldest period first. */
function liveRows(byLoan: Map<number, LoanScheduleRow[]>, loanId: number, version: number): LoanScheduleRow[] {
  return (byLoan.get(loanId) ?? [])
    .filter((row) => row.version === version)
    .sort((a, b) => a.period_no - b.period_no);
}

/** The picker: every loan, the versions it actually has, and what is still owed on it. */
export async function listScheduleLoans(): Promise<ScheduleLoanEntry[]> {
  const [{ rows: loanRows }, schedules] = await Promise.all([
    listItems<Record<string, unknown>>("loan", { fields: LOAN_FIELDS, sort: "-created_at", limit: -1 }),
    readAllSchedules(),
  ]);

  const byLoan = groupByLoan(schedules);
  return loanRows.map((raw) => {
    const loan = mapLoan(raw);
    const rows = liveRows(byLoan, loan.id, loan.scheduleVersion);
    const versions = [...new Set((byLoan.get(loan.id) ?? []).map((row) => row.version))].sort((a, b) => b - a);
    const outstanding = rows.reduce((sum, row) => sum + Math.max(0, outstandingOf(row)), 0);
    return {
      ...loan,
      versions,
      outstandingPrincipal: round2(outstanding > 0 ? outstanding : loan.principal),
    };
  });
}

export interface ScheduleQuery {
  loanId: number | null;
  version: number | null;
  asOf: string;
  status: string | null;
  /** Inclusive range on the payable date, `YYYY-MM-DD`. Empty means "no bound". */
  dueFrom: string | null;
  dueTo: string | null;
  page: number;
  pageSize: number;
}

function agingRowsFor(
  loans: readonly ScheduleLoanEntry[],
  byLoan: Map<number, LoanScheduleRow[]>,
  asOf: string,
): { rows: LoanAgingRow[]; total: AgingBuckets } {
  const rows: LoanAgingRow[] = loans.map((loan) => ({
    loanId: loan.id,
    loanNo: loan.loanNo,
    lenderName: loan.lenderName,
    status: loan.status,
    graceDays: loan.graceDays,
    buckets: agingFromRows(liveRows(byLoan, loan.id, loan.scheduleVersion), asOf),
  }));
  const total = rows.reduce((acc, row) => mergeBuckets(acc, row.buckets), emptyBuckets());
  return { rows, total };
}

/**
 * One read for the whole screen.
 *
 * Totals are taken across every period of the version, not the page, because the number the
 * accountant checks is the one that has to equal the loan's principal. With no `loanId` the
 * answer is the portfolio view: no rows, but every loan's aging.
 */
export async function loadSchedule(query: ScheduleQuery): Promise<SchedulePayload> {
  const stored = await listScheduleLoans();
  const asOf = query.asOf || phtToday();
  const [schedules, holidays] = await Promise.all([readAllSchedules(), holidayNames()]);
  const byLoan = groupByLoan(schedules);
  // The badge follows the as-of date the reader picked, so it cannot disagree with the buckets
  // printed beside it. Derived here, never written back: a status is a view of time.
  const loans = stored.map((entry) => ({
    ...entry,
    status: deriveLoanStatus(entry.status, liveRows(byLoan, entry.id, entry.scheduleVersion), entry.graceDays, asOf),
  }));

  if (query.loanId === null) {
    const aging = agingRowsFor(loans, byLoan, asOf);
    // The portfolio PAS 1 split needs the installments themselves, so collect every live row once.
    const allLive = loans.flatMap((entry) => liveRows(byLoan, entry.id, entry.scheduleVersion));
    const loanPrincipal = loans.reduce((sum, entry) => sum + entry.principal, 0);
    const schedulePrincipal = allLive.reduce((sum, row) => sum + row.principal, 0);
    return {
      loans,
      loan: null,
      versions: [],
      rows: [],
      total: 0,
      totals: totalsFromRows([]),
      tie: null,
      kpis: kpisFromRows([], asOf, null),
      holidays,
      // Nothing on the desk means nothing to split: a ₱0.00 tile would read as a measured zero.
      currentPortion:
        allLive.length === 0 ? null : currentPortionFromRows(allLive, asOf, loanPrincipal, schedulePrincipal),
      agingRows: aging.rows,
      aging: aging.total,
      asOf,
    };
  }

  const loan = loans.find((entry) => entry.id === query.loanId) ?? null;
  if (!loan) throw new LoanNotFoundError("That loan is not in the register any more.");

  const version = query.version ?? loan.scheduleVersion;
  const all = liveRows(byLoan, loan.id, version);
  const versions = loan.versions.length > 0 ? loan.versions : [loan.scheduleVersion];

  if (all.length === 0) {
    const aging = agingRowsFor([loan], byLoan, asOf);
    return {
      loans,
      loan,
      versions,
      rows: [],
      total: 0,
      totals: totalsFromRows([]),
      tie: null,
      kpis: kpisFromRows([], asOf, loan),
      holidays,
      currentPortion: null,
      agingRows: aging.rows,
      aging: aging.total,
      asOf,
    };
  }

  // Filters narrow what the table lists and what its footer adds up; the KPIs stay a statement
  // about the whole version, so the tiles do not move while the reader pages.
  const filtered = all.filter((row) => {
    if (query.status && row.status !== query.status) return false;
    if (query.dueFrom && row.payment_due_date < query.dueFrom) return false;
    if (query.dueTo && row.payment_due_date > query.dueTo) return false;
    return true;
  });
  const start = query.pageSize > 0 ? (Math.max(1, query.page) - 1) * query.pageSize : 0;
  const rows = query.pageSize > 0 ? filtered.slice(start, start + query.pageSize) : filtered;
  const loanAging = agingFromRows(all, asOf);
  const totals = totalsFromRows(filtered);

  return {
    loans,
    loan,
    versions,
    rows,
    total: filtered.length,
    totals,
    tie: tieFor(all, loan.principal),
    kpis: kpisFromRows(all, asOf, loan),
    holidays,
    currentPortion: currentPortionFromRows(all, asOf, loan.principal, totalsFromRows(all).principal),
    agingRows: [
      {
        loanId: loan.id,
        loanNo: loan.loanNo,
        lenderName: loan.lenderName,
        status: loan.status,
        graceDays: loan.graceDays,
        buckets: loanAging,
      },
    ],
    aging: loanAging,
    asOf,
  };
}


export interface RefreshOptions {
  dryRun: boolean;
  loanId: number | null;
  actorId: number | null;
}

export async function refreshStatuses(asOf: string, options: RefreshOptions): Promise<RefreshResult> {
  const { rows: loanRows } = await listItems<Record<string, unknown>>("loan", {
    fields: ["id", "schedule_version", "grace_days", "status"],
    limit: -1,
  });
  const graceByLoan = new Map<number, number>();
  const versionByLoan = new Map<number, number>();
  const statusByLoan = new Map<number, LoanStatus>();
  for (const raw of loanRows) {
    graceByLoan.set(asNumber(raw.id), asNumber(raw.grace_days));
    versionByLoan.set(asNumber(raw.id), asNumber(raw.schedule_version, 1));
    statusByLoan.set(asNumber(raw.id), (asString(raw.status) || "PENDING_APPROVAL") as LoanStatus);
  }

  const schedules = await readAllSchedules();
  const live = schedules.filter((row) => versionByLoan.get(row.loan_id) === row.version);
  const scoped = options.loanId ? live.filter((row) => row.loan_id === options.loanId) : live;
  const plan = planRefresh(scoped, graceByLoan, asOf);

  let updated = 0;
  if (!options.dryRun) {
    for (const step of plan) {
      await updateItem("loan_schedule", step.id, {
        status: step.to,
        updated_at: phtStamp(),
        updated_by: options.actorId,
      });
      updated += 1;
    }
  }

  // The register filters, tiles and badge all read `loan.status`, so the loan row has to carry the
  // same answer the schedule just gave: an installment past its grace makes the loan overdue, and a
  // loan whose late installments were settled goes back to current. Loans in another stage keep
  // the status their own workflow set, and `approval_status` is never touched here.
  const rowsByLoan = new Map<number, LoanScheduleRow[]>();
  for (const row of scoped) {
    const held = rowsByLoan.get(row.loan_id);
    if (held) held.push(row);
    else rowsByLoan.set(row.loan_id, [row]);
  }
  const moves: Array<{ id: number; from: LoanStatus; to: LoanStatus; late: number }> = [];
  for (const [id, stored] of statusByLoan) {
    if (options.loanId && id !== options.loanId) continue;
    const rows = rowsByLoan.get(id) ?? [];
    const grace = graceByLoan.get(id) ?? 0;
    const next = deriveLoanStatus(stored, rows, grace, asOf);
    if (next !== stored) {
      const late = rows.filter(
        (row) => round2(row.principal - row.paid_principal) > 0.005 && daysBetween(row.payment_due_date, asOf) > grace,
      ).length;
      moves.push({ id, from: stored, to: next, late });
    }
  }
  if (!options.dryRun) {
    for (const move of moves) {
      await updateItem("loan", move.id, {
        status: move.to,
        updated_at: phtStamp(),
        updated_by: options.actorId,
      });
      // One event per loan, not per installment: the whole move is one fact about the loan, and the
      // description has to say both what it became and what moved it.
      const now = phtStamp();
      await createItem("loan_event", {
        loan_id: move.id,
        kind: "STATUS_CHANGED",
        occurred_at: now,
        description:
          move.to === "OVERDUE"
            ? `Moved to OVERDUE: ${move.late === 1 ? "1 installment is" : `${move.late} installments are`} past their due date.`
            : "Moved back to CURRENT: no installment is late.",
        amount: 0,
        reference: null,
        actor_id: options.actorId,
        created_at: now,
        created_by: options.actorId,
        updated_at: now,
        updated_by: options.actorId,
      });
    }
  }

  return {
    asOf,
    scanned: scoped.length,
    updated,
    markedDue: plan.filter((step) => step.to === "DUE").length,
    markedOverdue: plan.filter((step) => step.to === "OVERDUE").length,
    loansUpdated: options.dryRun ? 0 : moves.length,
    loansOverdue: moves.filter((move) => move.to === "OVERDUE").length,
    loansCurrent: moves.filter((move) => move.to === "CURRENT").length,
  };
}
