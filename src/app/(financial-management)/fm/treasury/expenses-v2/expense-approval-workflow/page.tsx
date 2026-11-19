import { AuthorityOperations } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/workspaces/AuthorityOperations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Deployed navigation uses this slug; retain the legacy module route as an alias. */
export default function ExpenseApprovalWorkflowPage() {
  return <AuthorityOperations />;
}
