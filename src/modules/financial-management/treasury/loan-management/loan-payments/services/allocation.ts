/**
 * The payment module's own copy of the engine pieces it needs.
 *
 * The house rule is one kernel copy per module, so this file repeats the allocation order from
 * `loan-register/services/loanEngine.ts` rather than importing across module folders. The order
 * is what matters and it is stated once here: penalties, then interest, then principal, oldest
 * installment first, and whatever is left over is held as an advance for the lender.
 */

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function penaltyAccrued(
  overdueAmount: number,
  daysLate: number,
  graceDays: number,
  monthlyRatePercent: number,
): number {
  const chargeable = daysLate - graceDays;
  if (overdueAmount <= 0 || chargeable <= 0 || monthlyRatePercent <= 0) return 0;
  return round2(((overdueAmount * monthlyRatePercent) / 100 / 30) * chargeable);
}

export interface InstallmentDue {
  periodNo: number;
  dueDate: string;
  penalty: number;
  interestOutstanding: number;
  principalOutstanding: number;
}

export type AllocationBucket = "PENALTY" | "INTEREST" | "PRINCIPAL" | "ADVANCE";

export interface PlannedAllocation {
  periodNo: number | null;
  bucket: AllocationBucket;
  amount: number;
}

/**
 * Every peso of a payment, split per installment so each schedule row can be updated.
 *
 * `loan_register`'s engine returns bare buckets because a schedule preview does not need to know
 * which row was paid; the database does.
 */
export function planAllocation(due: readonly InstallmentDue[], amount: number): PlannedAllocation[] {
  const lines: PlannedAllocation[] = [];
  let remaining = round2(amount);

  for (const installment of due) {
    if (remaining <= 0) break;
    const order: Array<[AllocationBucket, number]> = [
      ["PENALTY", round2(installment.penalty)],
      ["INTEREST", round2(installment.interestOutstanding)],
      ["PRINCIPAL", round2(installment.principalOutstanding)],
    ];
    for (const [bucket, outstanding] of order) {
      if (remaining <= 0) break;
      if (outstanding <= 0) continue;
      const applied = Math.min(remaining, outstanding);
      if (applied > 0) {
        lines.push({ periodNo: installment.periodNo, bucket, amount: round2(applied) });
      }
      remaining = round2(remaining - applied);
    }
  }

  if (remaining > 0) lines.push({ periodNo: null, bucket: "ADVANCE", amount: remaining });
  return lines;
}
