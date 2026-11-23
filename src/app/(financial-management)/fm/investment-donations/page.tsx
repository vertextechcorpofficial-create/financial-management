import { notFound, redirect } from "next/navigation";
import { INVESTMENT_DONATIONS_PARENT, INVESTMENT_DONATIONS_WORKSPACES } from "@/modules/financial-management/investment-donations/workspaces";
import { ledgerAccess } from "@/modules/financial-management/investment-donations/server/access";
import { workspaceRole } from "@/modules/financial-management/investment-donations/server/permissions";

export default async function InvestmentDonationsPage() {
  const access = await ledgerAccess();
  if (!access) redirect(`/login?next=${encodeURIComponent(INVESTMENT_DONATIONS_PARENT.path)}`);
  const first = INVESTMENT_DONATIONS_WORKSPACES.find(row => workspaceRole(access, row.key) !== "none");
  if (!first) notFound();
  redirect(first.path);
}
