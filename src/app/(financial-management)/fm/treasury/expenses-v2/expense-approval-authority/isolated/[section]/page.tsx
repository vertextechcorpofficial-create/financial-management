import { notFound } from "next/navigation";
import { IsolatedWorkflow } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/IsolatedWorkflow";
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!["requests", "inbox", "history", "settings"].includes(section)) notFound();
  return <IsolatedWorkflow key={section} section={section} />;
}
