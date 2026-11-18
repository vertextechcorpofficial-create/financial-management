import { daysPastDue } from "./aging";
import { TOUCHED_BY_PAYMENT, type InstallmentStatus } from "../constants";
import type { LoanScheduleRow } from "../types";

export interface RefreshPlanRow {
  id: number;
  loanId: number;
  periodNo: number;
  from: InstallmentStatus;
  to: InstallmentStatus;
}

/**
 * Works out the status each open installment should carry on `asOf`.
 *
 * An installment becomes DUE on its payment date and OVERDUE once the loan's grace days have run
 * out. The plan never moves a row backwards, and never touches an installment where money already
 * landed (PAID, PAID_IN_ADVANCE, PARTLY_PAID, RESTRUCTURED): those statuses carry a payment history
 * the refresh cannot reconstruct. A row that was never marked can go straight to OVERDUE.
 *
 * `loan_event` has no kind for "a due date passed", so the caller writes no event and posts no
 * journal entry. A status is a view of time, not a transaction.
 */
export function planRefresh(
  rows: readonly LoanScheduleRow[],
  graceDaysByLoan: ReadonlyMap<number, number>,
  asOf: string,
): RefreshPlanRow[] {
  const plan: RefreshPlanRow[] = [];
  for (const row of rows) {
    if (TOUCHED_BY_PAYMENT.includes(row.status)) continue;
    const graceDays = graceDaysByLoan.get(row.loan_id) ?? 0;
    const late = daysPastDue(row, asOf);
    const target: InstallmentStatus = late > graceDays ? "OVERDUE" : late >= 0 ? "DUE" : "UPCOMING";
    if (target === row.status) continue;
    if (row.status === "OVERDUE" && target !== "OVERDUE") continue;
    plan.push({ id: row.id, loanId: row.loan_id, periodNo: row.period_no, from: row.status, to: target });
  }
  return plan;
}
