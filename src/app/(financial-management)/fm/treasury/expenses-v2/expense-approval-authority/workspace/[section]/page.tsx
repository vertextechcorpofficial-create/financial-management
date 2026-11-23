import { notFound } from "next/navigation";
import { ApprovalWorkspace } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/workspaces/ApprovalWorkspace";
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!["my-approvals", "finance-review", "administration-audit"].includes(section)) notFound();
  return <ApprovalWorkspace key={section} section={section} />;
}
