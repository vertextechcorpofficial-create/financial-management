"use client";

import { useState } from "react";
import { ShieldCheck, RefreshCw, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthorityWorkspace } from "./hooks/useAuthorityWorkspace";
import { AuthorityMatrix } from "./authority-matrix";
import { PolicyActions } from "./components/PolicyActions";
import { DelegationsPanel } from "./delegations";
import { PolicyEvaluationPanel } from "./evaluation";
import { ExceptionsPanel } from "./exceptions";
import { AuthorityAuditHistory } from "./audit-history";
import { OverviewSubmodule } from "./overview";
import { AccessManagementPanel } from "./user-access";
import { Notice, Status, selectClass } from "./components/shared";

export function ExpenseApprovalAuthorityModule({ initialTab = "overview", enforceInitialTab = false }: { initialTab?: string; enforceInitialTab?: boolean } = {}) {
  const { context, loading, busy, error, refresh, command } = useAuthorityWorkspace();
  const [tab, setTab] = useState(initialTab), [selectedId, setSelectedId] = useState(""), [refreshError, setRefreshError] = useState(""), [refreshing, setRefreshing] = useState(false);
  if (loading) return <div role="status" className="space-y-4 p-4"><div className="h-8 w-72 animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded-xl bg-muted" /><p className="text-sm text-muted-foreground">Verifying session and loading authority workspace…</p></div>;
  if (!context) return <div className="space-y-4 p-4"><Notice danger>{error || "Authority workspace unavailable."}</Notice><Button variant="outline" onClick={() => window.location.reload()}>Retry workspace</Button></div>;
  const policies = context.workspace.policies;
  const policy = policies.find(p => p.id === selectedId) || policies.at(-1) || null;
  const companyPolicies = policy ? policies.filter(p => p.companyId === policy.companyId) : policies;
  const now = new Date().toISOString();
  const active = companyPolicies.filter(p => p.status === "PUBLISHED" && p.effectiveFrom && p.effectiveFrom <= now && (!p.effectiveTo || now < p.effectiveTo));
  const delegations = context.workspace.delegations.filter(d => !policy || d.companyId === policy.companyId);
  const effectiveDelegations = delegations.filter(d => d.status === "ACTIVE" && d.startsAt <= now && (!d.endsAt || now < d.endsAt));
  const exceptions = context.workspace.exceptions.filter(e => !policy || e.companyId === policy.companyId);
  const uiPages = [["overview", "Overview"], ["matrix", "Authority matrix"], ["delegations", "Delegations"], ["evaluation", "Evaluate policy"], ["exceptions", "Exceptions"], ["audit", "Audit history"]] as const;
  const uiSlug: Record<string, string> = { overview: "overview", matrix: "authority-matrix", delegations: "delegations", evaluation: "evaluation", exceptions: "exceptions", audit: "audit-history" };
  const visiblePages = uiPages.filter(([page]) => context.actor.grants.some(grant => grant.permission === `expense_authority.ui.${uiSlug[page]}`));
  if (context.actor.admin) visiblePages.push(["access", "User access"] as never);
  const currentTab = visiblePages.some(([value]) => value === tab) ? tab : visiblePages[0]?.[0] || "access";
  const canUi = (page: string) => context.actor.grants.some(grant => grant.permission === `expense_authority.ui.${uiSlug[page]}`);
  if (enforceInitialTab && !visiblePages.some(([value]) => value === initialTab) && !(initialTab === "access" && context.actor.admin)) {
    return <div className="rounded-lg border border-dashed p-8 text-center"><LockKeyhole className="mx-auto mb-2 size-5 text-muted-foreground" /><h2 className="font-semibold">Submodule access not assigned</h2><p className="mt-1 text-sm text-muted-foreground">Your account is not authorized to open this Expense Approval Authority page.</p></div>;
  }
  return <div className="mx-auto max-w-[1600px] space-y-5 pb-8 [&_button]:cursor-pointer">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5"><div className="flex items-start gap-3"><div className="rounded-xl border border-primary/15 bg-primary/5 p-2.5"><ShieldCheck className="size-6 text-primary" /></div><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Treasury / Expenses V2</p><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Expense Approval Authority</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Clear spending limits. Accountable officers. Traceable policy decisions.</p></div></div><div className="flex items-center gap-2"><Status value={policy?.status || "DRAFT"} /><Button size="icon" variant="outline" aria-label="Refresh authority workspace" disabled={busy || refreshing} onClick={async () => { setRefreshing(true); try { await refresh(); setRefreshError(""); } catch (e) { setRefreshError((e as Error).message); } finally { setRefreshing(false); } }}><RefreshCw className={refreshing ? "animate-spin" : ""} /></Button></div></div>
    <Notice><strong>Standalone policy management · enforcement not connected.</strong> Configuration and audit records are persisted in Directus. Existing expense approvals, budgets, and disbursements remain unchanged.</Notice>
    {(error || refreshError) && <Notice danger>{error || refreshError}</Notice>}
    <div className="flex flex-wrap items-end justify-between gap-4"><label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">Policy version / company<select className={`${selectClass} max-w-full sm:w-[380px]`} value={policy?.id || ""} onChange={e => setSelectedId(e.target.value)}><option value="" disabled={!!policies.length}>Proposed memo reference · not persisted</option>{policies.toReversed().map(p => <option key={p.id} value={p.id}>Company #{p.companyId} · v{p.version} · {p.name} [{p.status}]</option>)}</select></label>
       {canUi("matrix") && <PolicyActions policy={policy} busy={busy} command={command} permissions={{ create: context.actor.grants.some(g => g.permission === "expense_authority.policy.create"), edit: context.actor.grants.some(g => g.permission === "expense_authority.policy.edit_draft"), submit: context.actor.grants.some(g => g.permission === "expense_authority.policy.submit"), publish: context.capabilities.publishPolicy, revoke: context.capabilities.revokePolicy }} />}</div>
     <Tabs value={currentTab} onValueChange={setTab} className="gap-5"><div className="max-w-full overflow-x-auto pb-1"><TabsList aria-label="Authority workspace sections">{visiblePages.map(([value, title]) => <TabsTrigger key={value} value={value}>{title}</TabsTrigger>)}</TabsList></div>
        {canUi("overview") && <TabsContent value="overview"><OverviewSubmodule policy={policy} activeCount={active.length} delegationCount={effectiveDelegations.length} exceptionCount={exceptions.filter(e => ["OPEN", "IN_REVIEW"].includes(e.status)).length} revision={context.revision} onOpen={setTab} canOpenMatrix={canUi("matrix")} canEvaluate={canUi("evaluation")} /></TabsContent>}
       {canUi("matrix") && <TabsContent value="matrix"><AuthorityMatrix key={`${policy?.id || "seed"}:${context.revision}`} policy={policy} policies={policies} canEdit={context.actor.grants.some(g => g.permission === "expense_authority.policy.edit_draft")} busy={busy} command={command} /></TabsContent>}
       {canUi("delegations") && <TabsContent value="delegations"><DelegationsPanel key={policy?.companyId || "all"} delegations={delegations} companyId={policy?.companyId || null} canManage={context.capabilities.manageDelegations} busy={busy} command={command} /></TabsContent>}
       {canUi("evaluation") && <TabsContent value="evaluation"><PolicyEvaluationPanel key={policy?.id || "none"} policy={policy} revision={context.revision} refresh={refresh} /></TabsContent>}
       {canUi("exceptions") && <TabsContent value="exceptions"><ExceptionsPanel items={exceptions} canReview={context.capabilities.reviewExceptions} busy={busy} command={command} /></TabsContent>}
       {canUi("audit") && <TabsContent value="audit"><AuthorityAuditHistory revision={context.revision} canView={context.capabilities.readAudit} /></TabsContent>}
       {context.actor.admin && <TabsContent value="access"><AccessManagementPanel /></TabsContent>}
       {!visiblePages.length && !context.actor.admin && <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"><LockKeyhole className="mx-auto mb-2 size-5" />No submodule access has been assigned.</div>}
    </Tabs>
  </div>;
}
