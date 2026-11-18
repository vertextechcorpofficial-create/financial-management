"use client";

import { useState } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthorityWorkspace } from "./hooks/useAuthorityWorkspace";
import { AuthorityMatrix } from "./authority-matrix";
import { PolicyActions } from "./components/PolicyActions";
import { DelegationsPanel } from "./delegations";
import { PolicyEvaluationPanel } from "./evaluation";
import { ExceptionsPanel } from "./exceptions";
import { AuthorityAuditHistory } from "./audit-history";
import { OverviewSubmodule } from "./overview";
import { Notice, Status, selectClass } from "./components/shared";

export function ExpenseApprovalAuthorityModule({ initialTab = "overview" }: { initialTab?: string } = {}) {
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
  const currentTab = ["overview", "matrix", "delegations", "evaluation", "exceptions", "audit"].includes(tab) ? tab : "overview";
  return <div className="mx-auto max-w-[1600px] space-y-5 pb-8 [&_button]:cursor-pointer">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-5"><div className="flex items-start gap-3"><div className="rounded-xl border border-primary/15 bg-primary/5 p-2.5"><ShieldCheck className="size-6 text-primary" /></div><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Treasury / Expenses V2</p><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Expense Approval Authority</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Clear spending limits. Accountable officers. Traceable policy decisions.</p></div></div><div className="flex items-center gap-2"><Status value={policy?.status || "DRAFT"} /><Button size="icon" variant="outline" aria-label="Refresh authority workspace" disabled={busy || refreshing} onClick={async () => { setRefreshing(true); try { await refresh(); setRefreshError(""); } catch (e) { setRefreshError((e as Error).message); } finally { setRefreshing(false); } }}><RefreshCw className={refreshing ? "animate-spin" : ""} /></Button></div></div>
     {(error || refreshError) && <Notice danger>{error || refreshError}</Notice>}
     <div className="flex flex-wrap items-end justify-between gap-4"><label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted-foreground">Policy version / company<select className={`${selectClass} max-w-full sm:w-[380px]`} value={policy?.id || ""} onChange={e => setSelectedId(e.target.value)}><option value="" disabled={!!policies.length}>Proposed memo reference · not persisted</option>{policies.toReversed().map(p => <option key={p.id} value={p.id}>Company #{p.companyId} · v{p.version} · {p.name} [{p.status}]</option>)}</select></label>
        {["overview", "matrix", "evaluation"].includes(currentTab) && <PolicyActions policy={policy} busy={busy} command={command} permissions={{ create: context.actor.grants.some(g => g.permission === "expense_authority.policy.create"), edit: context.actor.grants.some(g => g.permission === "expense_authority.policy.edit_draft"), submit: context.actor.grants.some(g => g.permission === "expense_authority.policy.submit"), publish: context.capabilities.publishPolicy, revoke: context.capabilities.revokePolicy }} />}</div>
      {currentTab === "overview" && <OverviewSubmodule policy={policy} activeCount={active.length} delegationCount={effectiveDelegations.length} exceptionCount={exceptions.filter(e => ["OPEN", "IN_REVIEW"].includes(e.status)).length} revision={context.revision} onOpen={setTab} canOpenMatrix canEvaluate />}
      {currentTab === "matrix" && <AuthorityMatrix key={`${policy?.id || "seed"}:${context.revision}`} policy={policy} policies={policies} canEdit={context.actor.grants.some(g => g.permission === "expense_authority.policy.edit_draft")} busy={busy} command={command} />}
      {currentTab === "delegations" && <DelegationsPanel key={policy?.companyId || "all"} delegations={delegations} companyId={policy?.companyId || null} canManage={context.capabilities.manageDelegations} busy={busy} command={command} />}
      {currentTab === "evaluation" && <PolicyEvaluationPanel key={policy?.id || "none"} policy={policy} revision={context.revision} refresh={refresh} />}
      {currentTab === "exceptions" && <ExceptionsPanel items={exceptions} canReview={context.capabilities.reviewExceptions} busy={busy} command={command} />}
      {currentTab === "audit" && <AuthorityAuditHistory revision={context.revision} canView={context.capabilities.readAudit} />}
  </div>;
}
