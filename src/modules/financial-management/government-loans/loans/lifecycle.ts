export const changeLabels = {
  AMORTIZATION: "Change amortization",
  SUSPENSION: "Suspend deductions",
  PAID_DIRECTLY: "Paid directly to agency",
  SEPARATION: "Request final pay",
  REFUND: "Record agency refund",
} as const;
export type ChangeKind = keyof typeof changeLabels;
export type DisputeStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";
export const disputeLabels: Record<DisputeStatus, string> = {
  OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved",
};
export const nextDisputeStatus = { OPEN: "IN_PROGRESS", IN_PROGRESS: "RESOLVED", RESOLVED: null } as const;
export function eligibleHire(hired: string, businessDate: string) {
  const days = (Date.parse(businessDate) - Date.parse(hired)) / 86_400_000;
  return days >= 0 && days <= 150;
}
