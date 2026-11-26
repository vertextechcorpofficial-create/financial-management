export const remittanceApprovalSorts = {
  agency: "Agency",
  month: "Payroll month",
  amount: "Amount paid",
  penalty: "Penalty",
  paymentDate: "Paid on",
  reference: "Reference",
  preparedBy: "Prepared by",
  waiting: "Waiting",
} as const;
export type RemittanceApprovalSort = keyof typeof remittanceApprovalSorts;
export const remittanceApprovalPageSizes = [10, 25, 50] as const;
export type RemittanceApprovalPageSize = typeof remittanceApprovalPageSizes[number];

export type RemittanceApprovalSummary = {
  pending: number;
  overdue: number;
  oldestWaitingDays: number;
  amount: string;
  penalty: string;
};
