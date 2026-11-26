import { notFound, redirect } from "next/navigation";
import InvestmentDonationsModule from "@/modules/financial-management/investment-donations/InvestmentDonationsModule";
import { INVESTMENT_DONATIONS_WORKSPACES, type WorkspaceKey } from "@/modules/financial-management/investment-donations/workspaces";
import { ledgerAccess } from "@/modules/financial-management/investment-donations/server/access";
import { readDirectusLedger } from "./read-directus-ledger";
import { postingAvailable } from "./database";
import { readReconciliations } from "./reconciliation-access";
import { allows, canExportFullLedger, canUseDataTools, workspaceRole } from "./permissions";
import { readDonationDocuments } from "./donation-documents";
import { readAnnualReviews } from "./review-access";
import { projectLedger, recentLedgerEntries } from "./projections.mjs";
import { dataToolsEnabled } from "./data-tools.mjs";
import { annualReviewEvidence } from "../analytics";
import { fiscalDates } from "../ledger";
import type { Entry } from "../ledger";

export default async function InvestmentDonationsWorkspacePage({ workspace }: { workspace: WorkspaceKey }) {
  const definition = INVESTMENT_DONATIONS_WORKSPACES.find(item => item.key === workspace)!;
  const access = await ledgerAccess();
  if (!access) redirect(`/login?next=${encodeURIComponent(definition.path)}`);
  const role = workspaceRole(access, workspace);
  if (role === "none") notFound();
  const mayWrite = allows(role, workspace === "transactions" ? "approve" : "prepare");
  const mayReverse = (workspace === "transactions" || workspace === "overview") && allows(workspaceRole(access, "transactions"), "approve");
  const [ledger, canPost, reconciliations, donationDocuments, annualReviews] = await Promise.all([
    readDirectusLedger().catch(error => {
      const message = error instanceof Error ? error.message : "";
      console.error("[CapitalGiving] Ledger read unavailable:", /^GET cgl_[a-z_]+: HTTP \d{3} \([A-Z_]+\)$/.test(message) ? message : "Connection or ledger validation failed.");
      return null;
    }), (mayWrite || (workspace === "overview" && mayReverse)) ? postingAvailable() : false,
    ["overview", "monthly-reconciliation", "period-close", "annual-review"].includes(workspace) ? readReconciliations() : null,
    workspace === "charitable-giving" || workspace === "overview" || workspace === "tax-compliance" || workspace === "annual-review" ?
      readDonationDocuments(workspace === "tax-compliance" ? "all" : false) : null,
    workspace === "annual-review" || workspace === "overview" ? readAnnualReviews() : null,
  ]);
  if (!ledger) return <section className="space-y-3 p-6" role="status">
    <h1 className="text-xl font-semibold">Capital &amp; Giving Ledger unavailable</h1>
    <p>Ledger records could not be loaded from the configured data service. Check the connection and collection read permissions.</p>
    <p className="text-sm text-muted-foreground">Viewing does not require the posting extension or additional environment settings. No sample figures are substituted and no records have been changed.</p>
  </section>;
  const { journal, registers } = ledger;
  const asOf = [new Date().toISOString().slice(0, 10), ...(journal as Entry[]).map((entry: Entry) => entry.date)].sort().at(-1)!;
  const projected = projectLedger(workspace, journal, registers);
  const annualEvidence = workspace === "annual-review" ? Object.fromEntries(Array.from(new Set([
    fiscalDates(asOf, registers.policy.fyStart).from, ...(journal as Entry[]).map((row: Entry) => fiscalDates(row.date, registers.policy.fyStart).from),
    ...(annualReviews ?? []).map((row: { fiscal_start: string }) => row.fiscal_start),
  ])).map(start => [start, annualReviewEvidence(journal, registers, start, donationDocuments, reconciliations)])) : undefined;
  const projectedRegisters = projected.registers as unknown as typeof registers;
  projectedRegisters.dataToolsEnabled = workspace === "policy-targets" && dataToolsEnabled() && canUseDataTools(access);
  projectedRegisters.canExportFullLedger = workspace === "policy-targets" && canExportFullLedger(access);
  const safeReconciliations = workspace === "monthly-reconciliation" ? reconciliations : reconciliations?.map(row => ({
    ...row, prepared_by: 0, approved_by: row.approved_by ? 0 : null, payload: { ...row.payload, notes: {} },
  })) ?? null;
  const safeReviews = workspace === "annual-review" ? annualReviews : annualReviews?.map(row => ({ ...row, actor: 0, prepared_by: 0, reason: null })) ?? null;
  return <>
    {mayWrite && !canPost && <p className="px-6 pt-3 text-sm text-muted-foreground">Read-only: the transactional posting service is unavailable. Ledger viewing remains enabled.</p>}
    <InvestmentDonationsModule workspace={definition.key} canPost={canPost && mayWrite} canReverse={canPost && mayReverse}
      journal={projected.journal} registers={projectedRegisters} reconciliations={safeReconciliations} reconciliationRole={role} actor={access.id}
      annualEvidence={annualEvidence}
      recentEntries={workspace === "overview" ? recentLedgerEntries(mayReverse ? projectLedger("transactions", journal, registers).journal : journal, mayReverse) : undefined}
      projectionNotice={workspace === "overview" || workspace === "annual-review" ? "Financial activity is summarized on the server; transaction and personal details are restricted to their authorized workspaces." : undefined}
      annualReviews={safeReviews} donationDocuments={workspace === "overview" || workspace === "annual-review" ? null : donationDocuments} />
  </>;
}
