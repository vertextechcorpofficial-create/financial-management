import { addMonths, daysBetween, round2 } from "./loanEngine";
import type {
  AgingBucketKey,
  AgingBuckets,
  CurrentPortionSplit,
  LoanScheduleRow,
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

/** Adds one loan's unpaid installments into a bucket set. */
export function agingFromRows(rows: readonly LoanScheduleRow[], asOf: string): AgingBuckets {
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

/** The tie test the card prints when a schedule's installments do not add up to the loan. */
export function tieFor(totals: ScheduleTotals, loanPrincipal: number): ScheduleTie {
  const difference = round2(totals.principal - loanPrincipal);
  return {
    schedulePrincipal: totals.principal,
    loanPrincipal: round2(loanPrincipal),
    difference,
    ties: Math.abs(difference) < 0.005,
  };
}
