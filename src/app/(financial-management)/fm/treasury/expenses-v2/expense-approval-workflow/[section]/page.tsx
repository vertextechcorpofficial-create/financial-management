import { notFound } from "next/navigation";
import { AuthorityOperations } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/workspaces/AuthorityOperations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sections = { "my-approvals": "approvals" } as const;

export default async function ExpenseApprovalWorkflowSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!Object.hasOwn(sections, section)) notFound();
  return <AuthorityOperations initialSection={sections[section as keyof typeof sections]} />;
}
