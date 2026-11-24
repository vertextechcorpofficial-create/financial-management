import { addMonths, daysBetween, round2 } from "./loanEngine";
import type {
  AgingBucketKey,
  AgingBuckets,
  CurrentPortionSplit,
  LoanScheduleRow,
  LoanStatus,
  ScheduleTie,
  ScheduleTotals,
} from "../types";

/**
 * The arithmetic behind the aging and PAS 1 panels.
 *
 * Kept free of `server-only` and of any database call so the same functions run in the route
 * handler and in a scratch check: what the screen prints is what these functions return.
 */

export function outstandingOf(row: LoanScheduleRow): number {
  return round2(row.principal - row.paid_principal);
}

export function isUnpaid(row: LoanScheduleRow): boolean {
  return outstandingOf(row) > 0.005;
}

/** Days past the payment date; zero or negative means the installment is not late yet. */
export function daysPastDue(row: LoanScheduleRow, asOf: string): number {
  return daysBetween(row.payment_due_date, asOf);
}

export function bucketKeyForDays(daysPast: number): AgingBucketKey {
  if (daysPast <= 0) return "current";
  if (daysPast <= 30) return "d1_30";
  if (daysPast <= 60) return "d31_60";
  if (daysPast <= 90) return "d61_90";
  if (daysPast <= 180) return "d91_180";
  return "over180";
}

export function emptyBuckets(): AgingBuckets {
  return {
    current: 0,
    d1_30: 0,
    d31_60: 0,
    d61_90: 0,
    d91_180: 0,
    over180: 0,
    overduePrincipal: 0,
    outstandingPrincipal: 0,
  };
}

/** Adds one loan's unpaid installments into a bucket set. */export function agingFromRows(rows: readonly LoanScheduleRow[], asOf: string): AgingBuckets {
  const buckets = emptyBuckets();
  for (const row of rows) {
    if (!isUnpaid(row)) continue;
    const remaining = outstandingOf(row);
    const key = bucketKeyForDays(daysPastDue(row, asOf));
    buckets[key] = round2(buckets[key] + remaining);
    buckets.outstandingPrincipal = round2(buckets.outstandingPrincipal + remaining);
    if (key !== "current") buckets.overduePrincipal = round2(buckets.overduePrincipal + remaining);
  }
  return buckets;
}

/** The three columns the badge rule needs, so a trimmed row type can be passed in. */
export interface StatusRow {
  payment_due_date: string;
  principal: number;
  paid_principal: number;
}

/**
 * The badge a loan carries on `asOf`, in both directions.
 *
 * `loan.status` only moves when something writes it, so a CURRENT loan whose installments have
 * gone past their due date kept reading CURRENT while the aging beside it said otherwise. A read
 * derives the answer and writes nothing; the refresh action writes the same answer back, so the
 * stored column and this function never disagree for long.
 *
 * Only the two states the schedule owns are derived: a pending, rejected, released-for-later or
 * closed loan keeps whatever its own workflow set.
 */
export function deriveLoanStatus(
  status: LoanStatus,
  rows: readonly StatusRow[],
  graceDays: number,
  asOf: string,
): LoanStatus {
  if (status !== "CURRENT" && status !== "OVERDUE") return status;
  const late = rows.some(
    (row) => round2(row.principal - row.paid_principal) > 0.005 && daysBetween(row.payment_due_date, asOf) > graceDays,
  );
  return late ? "OVERDUE" : "CURRENT";
}

const BUCKET_KEYS: AgingBucketKey[] = ["current", "d1_30", "d31_60", "d61_90", "d91_180", "over180"];
export function mergeBuckets(target: AgingBuckets, source: AgingBuckets): AgingBuckets {
  for (const key of BUCKET_KEYS) target[key] = round2(target[key] + source[key]);
  target.overduePrincipal = round2(target.overduePrincipal + source.overduePrincipal);
  target.outstandingPrincipal = round2(target.outstandingPrincipal + source.outstandingPrincipal);
  return target;
}

export function totalsFromRows(rows: readonly LoanScheduleRow[]): ScheduleTotals {
  let interest = 0;
  let principal = 0;
  let payment = 0;
  let paidPrincipal = 0;
  let paidInterest = 0;
  let paidPenalty = 0;
  for (const row of rows) {
    interest += row.interest;
    principal += row.principal;
    payment += row.payment;
    paidPrincipal += row.paid_principal;
    paidInterest += row.paid_interest;
    paidPenalty += row.paid_penalty;
  }
  return {
    interest: round2(interest),
    principal: round2(principal),
    payment: round2(payment),
    paidPrincipal: round2(paidPrincipal),
    paidInterest: round2(paidInterest),
    paidPenalty: round2(paidPenalty),
    paid: round2(paidPrincipal + paidInterest + paidPenalty),
  };
}

/**
 * PAS 1 split of one loan's unpaid principal.
 *
 * Principal already past its payment date is current because it is payable now, and so is
 * anything falling due inside the twelve months after the as-of date; the rest is non-current.
 */
export function currentPortionFromRows(
  rows: readonly LoanScheduleRow[],
  asOf: string,
  loanPrincipal: number,
  schedulePrincipal: number,
): CurrentPortionSplit {
  const cutoff = addMonths(asOf, 12);
  let current = 0;
  let nonCurrent = 0;
  for (const row of rows) {
    const remaining = outstandingOf(row);
    if (remaining <= 0.005) continue;
    const due = row.payment_due_date;
    if (due < asOf || due <= cutoff) current = round2(current + remaining);
    else nonCurrent = round2(nonCurrent + remaining);
  }
  const difference = round2(schedulePrincipal - loanPrincipal);
  return {
    asOf,
    current,
    nonCurrent,
    outstandingPrincipal: round2(current + nonCurrent),
    ties: Math.abs(difference) < 0.005,
    schedulePrincipal,
    loanPrincipal,
  };
}

/**
 * The tie test the card prints when a schedule's installments do not add up.
 *
 * A restructure may add overdue interest to principal (P137), so a later version legitimately
 * schedules more principal than the loan was drawn for. What has to hold is the chain: every row
 * runs on from the one before it and the last one clears the balance. A step between two rows is
 * reported as capitalised principal rather than treated as a fault.
 */
export function tieFor(rows: readonly LoanScheduleRow[], loanPrincipal: number): ScheduleTie {
  const ordered = [...rows].sort((a, b) => a.period_no - b.period_no);
  const scheduled = round2(ordered.reduce((sum, row) => sum + row.principal, 0));
  const opening = round2(ordered[0]?.opening_principal ?? loanPrincipal);
  let capitalised = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    const step = round2(ordered[index].opening_principal - ordered[index - 1].closing_principal);
    if (Math.abs(step) >= 0.005) capitalised = round2(capitalised + step);
  }
  const leftOpen = round2(ordered[ordered.length - 1]?.closing_principal ?? 0);
  return {
    schedulePrincipal: scheduled,
    loanPrincipal: round2(loanPrincipal),
    openingPrincipal: opening,
    capitalised,
    difference: leftOpen,
    ties: Math.abs(leftOpen) < 0.005,
  };
}
