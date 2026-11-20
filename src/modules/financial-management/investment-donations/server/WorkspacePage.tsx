import { notFound, redirect } from "next/navigation";
import InvestmentDonationsModule from "@/modules/financial-management/investment-donations/InvestmentDonationsModule";
import { INVESTMENT_DONATIONS_WORKSPACES, type WorkspaceKey } from "@/modules/financial-management/investment-donations/workspaces";
import { ledgerAccess } from "@/modules/financial-management/investment-donations/server/access";
import { readDirectusLedger } from "./read-directus-ledger";
import { postingAvailable } from "./transaction-client";

export default async function InvestmentDonationsWorkspacePage({ workspace }: { workspace: WorkspaceKey }) {
  const definition = INVESTMENT_DONATIONS_WORKSPACES.find(item => item.key === workspace)!;
  const access = await ledgerAccess();
  if (!access) redirect(`/login?next=${encodeURIComponent(definition.path)}`);
  if (!access.workspaces.includes(definition.key)) notFound();
  const [{ journal, registers }, canPost] = await Promise.all([readDirectusLedger(), access.admin ? postingAvailable() : false]);
  return <>
    {access.admin && !canPost && <p className="px-6 pt-3 text-sm text-muted-foreground">Read-only: the Directus posting endpoint is unavailable.</p>}
    <InvestmentDonationsModule workspace={definition.key} canPost={canPost} journal={journal} registers={registers} />
  </>;
}
