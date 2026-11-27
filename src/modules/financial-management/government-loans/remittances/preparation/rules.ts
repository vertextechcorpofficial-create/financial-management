import { monthAfter } from "../../loans/monthly-payroll";
import { amountFromCentavos } from "../../loans/position";
import { centavos } from "../../payroll-handoff/contract";
import type { AgencySettings } from "../agencies/types";

export const remittanceChannels = {
  AGENCY_PORTAL: "Online agency portal / PRN",
  BANK_TRANSFER: "Bank transfer",
  OVER_THE_COUNTER: "Over the counter",
  CHECK: "Check",
} as const;
export type RemittanceChannel = keyof typeof remittanceChannels;
export const maxRemittanceSelection = 25;
export const maxRemittanceProofBytes = 5 * 1024 * 1024;
export const remittanceStates = ["PENDING", "APPROVED", "RETURNED"] as const;
export type RemittanceState = typeof remittanceStates[number];
export type RemittancePolicy = Pick<AgencySettings, "deadlineRule" | "deadlineDay" | "penaltyBasis" | "penaltyRatePercent" | "reminderDays">;

export const remitKey = (agencyId: number, month: string) => agencyId + ":" + month;
export const dayDifference = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / 86_400_000;

export function remittanceDeadline(month: string, policy: Pick<RemittancePolicy, "deadlineRule" | "deadlineDay">) {
  const followingMonth = monthAfter(month);
  if (policy.deadlineRule === "FIXED_DAY") return followingMonth + "-" + String(policy.deadlineDay).padStart(2, "0");
  const [year, next] = followingMonth.split("-").map(Number);
  return new Date(Date.UTC(year, next, 0)).toISOString().slice(0, 10);
}

export function remittancePenalty(withheld: string, payment: string, deadline: string, policy: RemittancePolicy) {
  const daysLate = Math.max(0, dayDifference(deadline, payment));
  if (!daysLate || policy.penaltyBasis === "NONE") return { daysLate, computedPenalty: "0.00" };
  const numerator = centavos(withheld) * centavos(policy.penaltyRatePercent ?? "0") * BigInt(daysLate);
  const denominator = policy.penaltyBasis === "MONTHLY" ? 300_000n : 10_000n;
  return { daysLate, computedPenalty: amountFromCentavos((numerator + denominator / 2n) / denominator) };
}

export const remittanceStatuses = {
  awaiting_payroll: "Awaiting Payroll",
  nothing: "Nothing to remit",
  due: "Due",
  overdue: "Overdue",
  pending: "Awaiting approval",
  approved: "Remitted",
  returned: "Returned",
} as const;
export type RemittanceStatus = keyof typeof remittanceStatuses;

export function remittanceStatus(withheld: string | null, state: RemittanceState | null, today: string, due: string,
  reminderDays: number, paymentDate?: string) {
  const days = dayDifference(today, due);
  const canSelect = withheld !== null && centavos(withheld) > 0n && state !== "PENDING" && state !== "APPROVED";
  const deadlineLabel = days === 0 ? "due today" : days > 0 ? "in " + days + " day(s)" : -days + " day(s) late";
  const result = (status: RemittanceStatus, label: string = remittanceStatuses[status]) => ({
    status, label, canSelect, deadlineLabel: canSelect ? deadlineLabel : null,
    reminder: canSelect && days <= reminderDays,
  });
  if (state === "PENDING") return result("pending");
  if (state === "APPROVED") {
    const late = paymentDate ? dayDifference(due, paymentDate) : 0;
    return { ...result("approved", late > 0 ? "Remitted " + late + " day(s) late" : "Remitted on time"),
      deadlineLabel: late > 0 ? late + " day(s) late" : "on time" };
  }
  if (state === "RETURNED") return result("returned");
  if (withheld === null) return result("awaiting_payroll");
  if (!canSelect) return result("nothing");
  if (days < 0) return result("overdue", "Overdue " + -days + " day(s)");
  return result("due", days === 0 ? "Due today" : "Due in " + days + " day(s)");
}

export function remittanceTotals(rows: { withheld: string; penalty: string | null }[]) {
  const withheld = rows.reduce((sum, row) => sum + centavos(row.withheld), 0n);
  const penalties = rows.every(row => row.penalty !== null)
    ? rows.reduce((sum, row) => sum + centavos(row.penalty ?? "0.00"), 0n) : null;
  return { withheld: amountFromCentavos(withheld), penalties: penalties === null ? null : amountFromCentavos(penalties),
    cashOut: penalties === null ? null : amountFromCentavos(withheld + penalties) };
}
