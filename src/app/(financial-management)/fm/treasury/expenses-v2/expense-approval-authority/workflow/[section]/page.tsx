import { notFound } from "next/navigation";
import { ExpenseApprovalWorkflowModule } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/ExpenseApprovalWorkflowModule";
export default async function WorkflowSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!["inbox", "finance-review", "history", "settings"].includes(section)) notFound();
  return <ExpenseApprovalWorkflowModule key={section} section={section} />;
}
