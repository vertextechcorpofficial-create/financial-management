import { notFound, redirect } from "next/navigation";
import InvestmentDonationsModule from "@/modules/financial-management/investment-donations/InvestmentDonationsModule";
import { INVESTMENT_DONATIONS_WORKSPACES, type WorkspaceKey } from "@/modules/financial-management/investment-donations/workspaces";
import { ledgerAccess } from "@/modules/financial-management/investment-donations/server/access";
import { readDirectusLedger } from "./read-directus-ledger";
import { postingAvailable } from "./database";
import { readReconciliations } from "./reconciliation-access";
import { allows, workspaceRole } from "./permissions";
import { readDonationDocuments } from "./donation-documents";
import { readAnnualReviews } from "./review-access";

export default async function InvestmentDonationsWorkspacePage({ workspace }: { workspace: WorkspaceKey }) {
  const definition = INVESTMENT_DONATIONS_WORKSPACES.find(item => item.key === workspace)!;
  const access = await ledgerAccess();
  if (!access) redirect(`/login?next=${encodeURIComponent(definition.path)}`);
  const role = workspaceRole(access, workspace);
  if (role === "none") notFound();
  const mayWrite = allows(role, workspace === "transactions" ? "approve" : "prepare");
  const mayReverse = allows(workspaceRole(access, "transactions"), "approve");
  const [{ journal, registers }, canPost, reconciliations, donationDocuments, annualReviews] = await Promise.all([
    readDirectusLedger(), (mayWrite || (workspace === "overview" && mayReverse)) ? postingAvailable() : false,
    workspace === "monthly-reconciliation" ? readReconciliations() : null,
    workspace === "charitable-giving" || workspace === "overview" || workspace === "tax-compliance" ?
      readDonationDocuments(workspace === "tax-compliance" ? "all" : false) : null,
    workspace === "annual-review" ? readAnnualReviews() : null,
  ]);
  return <>
    {mayWrite && !canPost && <p className="px-6 pt-3 text-sm text-muted-foreground">Read-only: the ledger write database is unavailable.</p>}
    <InvestmentDonationsModule workspace={definition.key} canPost={canPost && mayWrite} canReverse={canPost && mayReverse}
      journal={journal} registers={registers} reconciliations={reconciliations} reconciliationRole={role} actor={access.id}
      annualReviews={annualReviews} donationDocuments={workspace === "overview" && donationDocuments ? Object.fromEntries(Object.entries(donationDocuments)
        .map(([id, doc]) => [id, { form: doc.form, reference: "" }])) : donationDocuments} />
  </>;
}
