"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  BadgeCheck, BarChart3, CalendarCheck2, ClipboardCheck, FilePlus2, HandCoins,
  Landmark, LayoutDashboard, Send, UserRound, type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabIcon } from "./tab-icons";
import { tabTriggerClass } from "./ui";
import dynamic from "next/dynamic";
import type { EmployeeChoice } from "../requests/types";
import type { GovernmentLoansTab, GovernmentLoansWorkspace, GovernmentLoansWorkspaceKey } from "../workspaces";

function TabLoading() {
  return <div className="space-y-3" aria-busy="true">
    <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
    <div className="h-40 w-full animate-pulse rounded-lg bg-muted" />
  </div>;
}

const LoanApprovalModule = dynamic(() => import("../approval/LoanApprovalModule").then(module => module.LoanApprovalModule), { loading: TabLoading });
const LoanEnrollmentModule = dynamic(() => import("../enrollment/LoanEnrollmentModule").then(module => module.LoanEnrollmentModule), { loading: TabLoading });
const LoanVerificationModule = dynamic(() => import("../enrollment/LoanVerificationModule").then(module => module.LoanVerificationModule), { loading: TabLoading });
const LoanRegisterModule = dynamic(() => import("../loans/LoanRegisterModule").then(module => module.LoanRegisterModule), { loading: TabLoading });
const LoanChangesModule = dynamic(() => import("../loans/LoanChangesModule").then(module => module.LoanChangesModule), { loading: TabLoading });
const OnboardingExitsModule = dynamic(() => import("../loans/OnboardingExitsModule").then(module => module.OnboardingExitsModule), { loading: TabLoading });
const PostingDisputesModule = dynamic(() => import("../loans/PostingDisputesModule").then(module => module.PostingDisputesModule), { loading: TabLoading });
const MyLoansModule = dynamic(() => import("../my-loans/MyLoansModule").then(module => module.MyLoansModule), { loading: TabLoading });
const GovernmentLoansDashboard = dynamic(() => import("../dashboard/GovernmentLoansDashboard").then(module => module.GovernmentLoansDashboard), { loading: TabLoading });
const PayrollInstructionsModule = dynamic(() => import("../payroll-handoff/PayrollInstructionsModule").then(module => module.PayrollInstructionsModule), { loading: TabLoading });
const AgenciesModule = dynamic(() => import("../remittances/agencies/AgenciesModule").then(module => module.AgenciesModule), { loading: TabLoading });
const AgencyBillingModule = dynamic(() => import("../remittances/billing/AgencyBillingModule").then(module => module.AgencyBillingModule), { loading: TabLoading });
const RemittancePreparationModule = dynamic(() => import("../remittances/preparation/RemittancePreparationModule").then(module => module.RemittancePreparationModule), { loading: TabLoading });
const RemittanceApprovalModule = dynamic(() => import("../remittances/approval/RemittanceApprovalModule").then(module => module.RemittanceApprovalModule), { loading: TabLoading });
const MonthEndCloseModule = dynamic(() => import("../month-end-close/MonthEndCloseModule").then(module => module.MonthEndCloseModule), { loading: TabLoading });
const PeriodSetupModule = dynamic(() => import("../month-end-close/PeriodSetupModule").then(module => module.PeriodSetupModule), { loading: TabLoading });
const EmployeeLedgerReport = dynamic(() => import("../reports/GovernmentLoanReports").then(module => module.EmployeeLedgerReport), { loading: TabLoading });
const RemittanceReport = dynamic(() => import("../reports/GovernmentLoanReports").then(module => module.RemittanceReport), { loading: TabLoading });
const AuditTrailReport = dynamic(() => import("../reports/YearEndAndAuditReports").then(module => module.AuditTrailReport), { loading: TabLoading });
const YearEndSummaryReport = dynamic(() => import("../reports/YearEndAndAuditReports").then(module => module.YearEndSummaryReport), { loading: TabLoading });
const LoanRequestsModule = dynamic(() => import("../requests/LoanRequestsModule").then(module => module.LoanRequestsModule), { loading: TabLoading });

const workspaceIcons: Record<GovernmentLoansWorkspaceKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  "loan-applications": FilePlus2,
  loans: HandCoins,
  remittances: Send,
  "loan-approval": ClipboardCheck,
  "remittance-approval": BadgeCheck,
  "month-end-close": CalendarCheck2,
  reports: BarChart3,
  "my-loans": UserRound,
};

export function GovernmentLoansWorkspaceShell({ workspace, tabs, transferEmployee, reportActorId, requestApplicant, initialTab, canOpenSetup }: {
  reportActorId?: number;
  initialTab?: string;
  canOpenSetup?: boolean;
  requestApplicant?: Pick<EmployeeChoice, "id" | "name">;
  workspace: GovernmentLoansWorkspace;
  tabs: readonly GovernmentLoansTab[];
  transferEmployee?: EmployeeChoice;
}) {
  const Icon = workspaceIcons[workspace.key] ?? Landmark;
  const hasDashboard = workspace.key === "dashboard";
  const hasAgencies = workspace.key === "remittances";
  const hasRequests = workspace.key === "loan-applications";
  const hasApprovals = workspace.key === "loan-approval";
  const hasLoans = workspace.key === "loans";
  const hasMyLoans = workspace.key === "my-loans";
  const hasRemittanceApproval = workspace.key === "remittance-approval";
  const hasMonthEndClose = workspace.key === "month-end-close";
  const hasReports = workspace.key === "reports";
  const isScaffold = !hasDashboard && !hasAgencies && !hasRequests && !hasApprovals && !hasLoans && !hasMyLoans && !hasRemittanceApproval && !hasMonthEndClose && !hasReports;
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!tabs.length || !searchParams.has("tab")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    const search = params.toString();
    window.history.replaceState(window.history.state, "", window.location.pathname + (search ? "?" + search : "") + window.location.hash);
  }, [searchParams, tabs.length]);

  return <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
    <section className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-emerald-500/5 blur-2xl" />
      <div className="relative flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Government Loans</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{workspace.title}</h1>
            {isScaffold && <Badge variant="outline">Module registered</Badge>}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{workspace.description}</p>
        </div>
      </div>
    </section>

    {hasDashboard ? <GovernmentLoansDashboard /> : <section className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      {isScaffold && <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Workspace scaffold</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            This route is registered in the VOS module registry. It confirms the sidebar entry, workspace grant, and tab structure; feature delivery follows the Government Loans implementation plan.
          </p>
        </div>
        <Badge variant="outline">Registration scaffold</Badge>
      </div>}

      {tabs.length ? <Tabs key={initialTab} defaultValue={transferEmployee ? "enrollment" : initialTab ?? tabs[0].key} className={isScaffold ? "mt-4 gap-4" : "gap-4"}>
        <div className="overflow-x-auto">
          <TabsList aria-label={`${workspace.title} tabs`} className="flex h-auto w-full max-w-full min-w-0 justify-start gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
            {tabs.map(tab => <TabsTrigger key={tab.key} value={tab.key} className={tabTriggerClass}>
              <TabIcon tabKey={tab.key} />
              {tab.title}
            </TabsTrigger>)}
          </TabsList>
        </div>
        {tabs.map(tab => <TabsContent key={tab.key} value={tab.key} className="mt-0">
          {hasAgencies && tab.key === "agencies" ? <AgenciesModule /> :
            hasAgencies && tab.key === "to-remit" ? <RemittancePreparationModule /> :
            hasAgencies && tab.key === "billing-reconciliation" ? <AgencyBillingModule /> :
            hasRequests && tab.key === "requests" ? <LoanRequestsModule /> :
            hasRequests && tab.key === "enrollment" ? <LoanEnrollmentModule transferEmployee={transferEmployee} canOpenSetup={canOpenSetup} /> :
            hasApprovals && tab.key === "loan-requests" ? <LoanApprovalModule /> :
            hasApprovals && tab.key === "enrollment-verification" ? <LoanVerificationModule /> :
            hasLoans && (tab.key === "register" || tab.key === "agency-balances") ? <LoanRegisterModule tab={tab.key} /> :
            hasLoans && tab.key === "changes" ? <LoanChangesModule /> :
            hasLoans && tab.key === "onboarding-exits" ? <OnboardingExitsModule /> :
            hasLoans && tab.key === "posting-disputes" ? <PostingDisputesModule /> :
            hasLoans && tab.key === "payroll-instructions" ? <PayrollInstructionsModule canOpenSetup={canOpenSetup} /> :
            hasMonthEndClose && tab.key === "close" ? <MonthEndCloseModule setupHref="?tab=setup" /> :
            hasMonthEndClose && tab.key === "setup" ? <PeriodSetupModule /> :
            hasReports && tab.key === "employee-ledger" ? <EmployeeLedgerReport key={reportActorId} actorId={reportActorId} /> :
            hasReports && tab.key === "remittance-report" ? <RemittanceReport key={reportActorId} actorId={reportActorId} /> :
            hasReports && tab.key === "year-end-summary" ? <YearEndSummaryReport key={reportActorId} actorId={reportActorId} /> :
            hasReports && tab.key === "audit-trail" ? <AuditTrailReport key={reportActorId} actorId={reportActorId} /> : <div className="rounded-xl border border-dashed bg-muted/20 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{tab.title}</h3>
              <Badge variant="outline">Pending delivery</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              This tab is registered inside {workspace.title}. The {tab.title.toLowerCase()} workflow will be implemented in its assigned delivery.
            </p>
          </div>}
        </TabsContent>)}
      </Tabs> : hasMonthEndClose ? <MonthEndCloseModule /> : hasRemittanceApproval ? <RemittanceApprovalModule /> : hasMyLoans && requestApplicant
        ? <MyLoansModule key={requestApplicant.id} applicant={requestApplicant} /> : <div className="mt-4 rounded-xl border border-dashed bg-muted/20 p-6">
        <p className="text-sm font-medium">Single-view workspace</p>
        <p className="mt-1 text-sm text-muted-foreground">The prototype does not define sub-tabs for this workspace. Content will be implemented in its assigned delivery.</p>
      </div>}
    </section>}

    {isScaffold && <section className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-medium">Access is controlled by VOS module grants.</p>
      <p className="mt-1 text-amber-900/80 dark:text-amber-200/80">If a workspace is missing from the sidebar, verify the Government Loans parent grant and the corresponding child grant in the existing VOS permissions registry.</p>
    </section>}
  </main>;
}
