import { round2 } from "./loanEngine";
import type { LoanScheduleRow, ScheduleKpis, ScheduleLoanEntry } from "../types";

/**
 * The five KPI tiles above the schedule.
 *
 * Pure and free of `server-only`, so the route handler and the screen read the same arithmetic.
 * Every figure comes from the schedule rows themselves; nothing here is estimated.
 */

/** What one installment still owes: the installment less every amount already allocated to it. */
export function rowRemaining(row: LoanScheduleRow): number {
  const paid = row.paid_principal + row.paid_interest + row.paid_penalty;
  return round2(Math.max(0, row.payment - paid));
}

export function kpisFromRows(
  rows: readonly LoanScheduleRow[],
  asOf: string,
  loan: ScheduleLoanEntry | null,
): ScheduleKpis {
  const ordered = [...rows].sort((a, b) => a.period_no - b.period_no);

  const next = ordered.find((row) => rowRemaining(row) > 0.005) ?? null;

  let overdueAmount = 0;
  let overdueCount = 0;
  let carryingAmount: number | null = null;

  for (const row of ordered) {
    const remaining = rowRemaining(row);
    if (remaining > 0.005 && row.payment_due_date < asOf) {
      overdueAmount = round2(overdueAmount + remaining);
      overdueCount += 1;
    }
    // Carrying amount is the amortized cost after everything that has already happened: the last
    // period that fell due, including installments paid ahead of their date.
    if (row.payment_due_date <= asOf || remaining <= 0.005) carryingAmount = round2(row.close_carrying);
  }

  if (carryingAmount === null && ordered.length > 0) carryingAmount = round2(ordered[0].open_carrying);

  return {
    nextInstallment: next
      ? {
          periodNo: next.period_no,
          dueDate: next.due_date,
          paymentDate: next.payment_due_date,
          amount: round2(next.payment),
        }
      : null,
    overdueAmount,
    overdueCount,
    principalPayable: loan ? round2(loan.outstandingPrincipal) : 0,
    carryingAmount: loan ? carryingAmount : null,
    eirRate: loan ? loan.eirRate : 0,
  };
}

/** `2026-11-08` → `Sunday`. Parsed as a UTC calendar day, so no zone can shift it. */
export function weekdayOf(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getUTCDay()];
}

/**
 * Why the payable date moved off the contractual one, in the deck's own words: the holiday's name
 * when the register records one, otherwise the weekday, otherwise a plain business-day note.
 */
export function paymentShiftReason(
  dueDate: string,
  paymentDate: string,
  holidays: Record<string, string>,
): string | null {
  if (!dueDate || !paymentDate || dueDate === paymentDate) return null;
  const holiday = holidays[dueDate];
  if (holiday) return holiday;
  const weekday = weekdayOf(dueDate);
  if (weekday === "Saturday" || weekday === "Sunday") return weekday;
  return "Moved to the next business day";
}
