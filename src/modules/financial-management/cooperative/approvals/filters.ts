export const approvalTypes = [
  { value: "membership", label: "Membership" },
  { value: "loan", label: "Loan" },
  { value: "withdrawal", label: "Withdrawal" },
] as const;

export const approvalStatuses = ["PENDING", "ALL", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type ApprovalType = typeof approvalTypes[number]["value"];
export type ApprovalStatusFilter = typeof approvalStatuses[number];
