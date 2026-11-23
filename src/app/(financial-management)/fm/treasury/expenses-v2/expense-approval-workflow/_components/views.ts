export const authorityRoot = "/fm/treasury/expenses-v2/expense-approval-workflow";
export const operationsApi = "/api/fm/treasury/expenses-v2/authority-operations";
export type AuthorityView = "my-requests" | "my-approvals";

export function availableViews(authorities: readonly string[]): AuthorityView[] {
  const views: AuthorityView[] = [];
  if (!authorities.includes("CEO")) views.push("my-requests");
  if (authorities.length) views.push("my-approvals");
  return views;
}
