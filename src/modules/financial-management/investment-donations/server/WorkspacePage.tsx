import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { NavUser } from "@/components/shared/app-sidebar/nav-user";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import InvestmentDonationsModule from "@/modules/financial-management/investment-donations/InvestmentDonationsModule";
import { INVESTMENT_DONATIONS_WORKSPACES, type WorkspaceKey } from "@/modules/financial-management/investment-donations/workspaces";
import { ledgerAccess } from "@/modules/financial-management/investment-donations/server/access";
import { readDirectusLedger } from "./read-directus-ledger";
import { postingAvailable } from "./database";
import { readReconciliations, type ReconciliationRecord } from "./reconciliation-access";
import { allows, canExportFullLedger, canUseDataTools, workspaceRole } from "./permissions";
import { readDonationDocuments } from "./donation-documents";
import { readAnnualReviewHistory, readAnnualReviews } from "./review-access";
import { aggregateJournal, projectLedger, recentLedgerEntries } from "./projections.mjs";
import { dataToolsEnabled } from "./data-tools.mjs";
import { annualReviewEvidence } from "../analytics";
import { fiscalDates } from "../ledger";
import type { Entry } from "../ledger";
import type { ReviewEvent } from "../annual-review";
import { evaluateAttention } from "../attention";

const COOKIE_NAME = "vos_access_token";

function headerUser(token: string | undefined) {
  let payload: Record<string, unknown> | null = null;
  try {
    if (token) {
      const encoded = token.split(".")[1];
      const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (encoded.length % 4)) % 4);
      payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    }
  } catch {
    payload = null;
  }
  const value = (keys: string[]) => keys.map(key => payload?.[key]).find(item => typeof item === "string" && item.trim()) as string | undefined;
  const email = value(["email", "Email"]) ?? "";
  const name = [value(["Firstname", "FirstName", "firstName", "firstname", "first_name"]), value(["LastName", "Lastname", "lastName", "lastname", "last_name"])].filter(Boolean).join(" ") || email || "User";
  return { name, email, avatar: "/avatars/shadcn.jpg" };
}

export default async function InvestmentDonationsWorkspacePage({ workspace }: { workspace: WorkspaceKey }) {
  const definition = INVESTMENT_DONATIONS_WORKSPACES.find(item => item.key === workspace)!;
  const access = await ledgerAccess();
  if (!access) redirect(`/login?next=${encodeURIComponent(definition.path)}`);
  const role = workspaceRole(access, workspace);
  if (role === "none") notFound();
  const annual = workspace === "annual-review-preparer" || workspace === "annual-review-approver";
  const mayWrite = allows(role, workspace === "transactions" ? "approve" : "prepare");
  const mayReverse = (workspace === "transactions" || workspace === "overview") && allows(workspaceRole(access, "transactions"), "approve");
  const [ledger, canPost, reconciliations, donationDocuments, annualReviews, annualHistory] = await Promise.all([
    readDirectusLedger().catch(error => {
      const message = error instanceof Error ? error.message : "";
      console.error("[CapitalGiving] Ledger read unavailable:", /^GET cgl_[a-z_]+: HTTP \d{3} \([A-Z_]+\)$/.test(message) ? message : "Connection or ledger validation failed.");
      return null;
    }), (mayWrite || (workspace === "overview" && mayReverse)) ? postingAvailable() : false,
    annual || ["overview", "monthly-reconciliation-reconciliator", "monthly-reconciliation-approver", "period-close"].includes(workspace) ? readReconciliations() : null,
    workspace === "charitable-giving" || workspace === "overview" || workspace === "tax-compliance" || annual ?
      readDonationDocuments(workspace === "tax-compliance" ? "all" : false) : null,
    annual || workspace === "overview" ? readAnnualReviews() : null,
    annual ? readAnnualReviewHistory() : null,
  ]);
  if (!ledger) return <section className="space-y-3 p-6" role="status">
    <h1 className="text-xl font-semibold">Capital &amp; Giving Ledger unavailable</h1>
    <p>Ledger records could not be loaded from the configured data service. Check the connection and collection read permissions.</p>
    <p className="text-sm text-muted-foreground">Viewing does not require the posting extension or additional environment settings. No sample figures are substituted and no records have been changed.</p>
  </section>;
  const { journal, registers } = ledger;
   const evaluatedAt = new Date().toISOString();
   const asOf = evaluatedAt.slice(0, 10);
   const attention = workspace === "overview" ? evaluateAttention(journal, registers, donationDocuments, reconciliations, annualReviews,
     key => access.workspaces.includes(key) && allows(workspaceRole(access, key), "view"), evaluatedAt) : undefined;
   const currentJournal = journal.filter((entry: Entry) => entry.date <= asOf);
   const projected = projectLedger(workspace, workspace === "overview" ? currentJournal : journal, registers);
   if (workspace === "overview") projected.journal = aggregateJournal(projected.journal);
  const annualEvidence = annual ? Object.fromEntries(Array.from(new Set([
    fiscalDates(asOf, registers.policy.fyStart).from, ...(journal as Entry[]).map((row: Entry) => fiscalDates(row.date, registers.policy.fyStart).from),
    ...(annualReviews ?? []).map((row: { fiscal_start: string }) => row.fiscal_start),
  ])).map(start => [start, annualReviewEvidence(journal, registers, start, donationDocuments, reconciliations)])) : undefined;
   const projectedRegisters = projected.registers as unknown as typeof registers;
   if (workspace === "overview") {
     // Overview aggregates never need holder-level capital balances or identities.
     projectedRegisters.subs = [];
     projectedRegisters.certs = [];
     projectedRegisters.holders = [];
     projectedRegisters.recons = {};
   }
  projectedRegisters.dataToolsEnabled = workspace === "policy-targets" && dataToolsEnabled() && canUseDataTools(access);
  projectedRegisters.canExportFullLedger = workspace === "policy-targets" && canExportFullLedger(access);
  const safeReconciliations = workspace.startsWith("monthly-reconciliation-") ? reconciliations : reconciliations?.map((row: ReconciliationRecord) => ({
    ...row, prepared_by: 0, approved_by: row.approved_by ? 0 : null, payload: { ...row.payload, notes: {} },
  })) ?? null;
  const safeReviews = annual ? annualReviews : annualReviews?.map((row: ReviewEvent) => ({ ...row, actor: 0, prepared_by: 0, reason: null })) ?? null;
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const currentUser = headerUser(token);
  return <div className="flex h-full min-h-0 flex-col">
    <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background shadow-sm sm:h-16">
      <div className="flex h-full items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1 shrink-0" />
        <Separator orientation="vertical" className="mr-2 hidden h-4 shrink-0 sm:block" />
        <Breadcrumb><BreadcrumbList>
          <BreadcrumbItem className="hidden shrink-0 md:block"><BreadcrumbLink href="/fm">FM</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator className="hidden shrink-0 md:block" />
          <BreadcrumbItem><BreadcrumbPage className="truncate">Capital &amp; Giving Ledger</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList></Breadcrumb>
      </div>
      <div className="flex h-full items-center px-4"><NavUser user={currentUser} /></div>
    </header>
    <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      {mayWrite && !canPost && <p className="px-6 pt-3 text-sm text-muted-foreground">Read-only: the transactional posting service is unavailable. Ledger viewing remains enabled.</p>}
       <InvestmentDonationsModule workspace={definition.key} canPost={canPost && mayWrite} canReverse={canPost && mayReverse}
        journal={projected.journal} registers={projectedRegisters} reconciliations={workspace === "overview" ? null : safeReconciliations} reconciliationRole={role} actor={access.id}
        annualEvidence={annualEvidence} annualHistory={annualHistory} attention={attention} evaluatedAt={evaluatedAt}
        recentEntries={workspace === "overview" ? recentLedgerEntries(mayReverse ? projectLedger("transactions", currentJournal, registers).journal : currentJournal, mayReverse) : undefined}
       actorName={currentUser.name}
        projectionNotice={workspace === "overview" || annual ? "Financial activity is summarized on the server; transaction and personal details are restricted to their authorized workspaces." : undefined}
         annualReviews={workspace === "overview" ? null : safeReviews} donationDocuments={workspace === "overview" || annual ? null : donationDocuments} />
    </main>
  </div>;
}
