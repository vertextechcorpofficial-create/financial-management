import { notFound, redirect } from "next/navigation";

const sections: Record<string, string> = {
  overview: "approvals", "my-approvals": "approvals", inbox: "approvals",
  "finance-review": "finance", exceptions: "finance",
  "authority-matrix": "administration", delegations: "administration",
  "audit-history": "administration", history: "administration", settings: "administration",
  "administration-audit": "administration", evaluation: "approvals",
};
export default async function Page({ params }: { params: Promise<{ submodule: string }> }) {
  const { submodule } = await params;
  if (!Object.hasOwn(sections, submodule)) notFound();
  redirect(`/fm/treasury/expenses-v2/expense-approval-authority?section=${sections[submodule]}`);
}
