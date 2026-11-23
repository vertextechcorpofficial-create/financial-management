import { redirect } from "next/navigation";
import { authorityRoot } from "./_components/views";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function ExpenseApprovalWorkflowPage() {
  redirect(`${authorityRoot}/my-requests`);
}
