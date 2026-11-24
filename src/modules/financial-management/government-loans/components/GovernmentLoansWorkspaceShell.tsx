"use client";

import {
  BadgeCheck, BarChart3, CalendarCheck2, ClipboardCheck, FilePlus2, HandCoins,
  Landmark, LayoutDashboard, Send, UserRound, type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoanApprovalModule } from "../approval/LoanApprovalModule";
import { AgenciesModule } from "../remittances/agencies/AgenciesModule";
import { LoanRequestsModule } from "../requests/LoanRequestsModule";
import type { GovernmentLoansTab, GovernmentLoansWorkspace, GovernmentLoansWorkspaceKey } from "../workspaces";

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

export function GovernmentLoansWorkspaceShell({ workspace, tabs }: {
  workspace: GovernmentLoansWorkspace;
  tabs: readonly GovernmentLoansTab[];
}) {
  const Icon = workspaceIcons[workspace.key] ?? Landmark;
  const hasAgencies = workspace.key === "remittances";
  const hasRequests = workspace.key === "loan-applications";
  const hasApprovals = workspace.key === "loan-approval";
  const isScaffold = !hasAgencies && !hasRequests && !hasApprovals;

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

    <section className="rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      {isScaffold && <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Workspace scaffold</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            This route is registered in the VOS module registry. It confirms the sidebar entry, workspace grant, and tab structure; feature delivery follows the Government Loans implementation plan.
          </p>
        </div>
        <Badge variant="outline">Registration scaffold</Badge>
      </div>}

      {tabs.length ? <Tabs defaultValue={hasAgencies ? "agencies" : tabs[0].key} className={isScaffold ? "mt-4 gap-4" : "gap-4"}>
        <div className="overflow-x-auto">
          <TabsList aria-label={`${workspace.title} tabs`} className="flex h-auto w-full max-w-full min-w-0 justify-start gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
            {tabs.map(tab => <TabsTrigger key={tab.key} value={tab.key} className="shrink-0 whitespace-nowrap data-[state=active]:bg-background">
              {tab.title}
            </TabsTrigger>)}
          </TabsList>
        </div>
        {tabs.map(tab => <TabsContent key={tab.key} value={tab.key} className="mt-0">
          {hasAgencies && tab.key === "agencies" ? <AgenciesModule /> :
            hasRequests && tab.key === "requests" ? <LoanRequestsModule /> :
            hasApprovals && tab.key === "loan-requests" ? <LoanApprovalModule /> : <div className="rounded-xl border border-dashed bg-muted/20 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold">{tab.title}</h3>
              <Badge variant="outline">Pending delivery</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              This tab is registered inside {workspace.title}. The {tab.title.toLowerCase()} workflow will be implemented in its assigned delivery.
            </p>
          </div>}
        </TabsContent>)}
      </Tabs> : <div className="mt-4 rounded-xl border border-dashed bg-muted/20 p-6">
        <p className="text-sm font-medium">Single-view workspace</p>
        <p className="mt-1 text-sm text-muted-foreground">The prototype does not define sub-tabs for this workspace. Content will be implemented in its assigned delivery.</p>
      </div>}
    </section>

    {isScaffold && <section className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <p className="font-medium">Access is controlled by VOS module grants.</p>
      <p className="mt-1 text-amber-900/80 dark:text-amber-200/80">If a workspace is missing from the sidebar, verify the Government Loans parent grant and the corresponding child grant in the existing VOS permissions registry.</p>
    </section>}
  </main>;
}
