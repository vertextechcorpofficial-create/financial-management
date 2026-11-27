import { NextResponse, type NextRequest } from "next/server";
import { requireAuthorityAccess, hasPermission } from "../expense-approval-authority/_lib/auth";
import { readRows } from "../expense-approval-authority/_lib/directus";
import { loadWorkspace } from "../expense-approval-authority/_lib/repository";
import { minimumAuthority } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/evaluateAuthority";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Snapshot = { amount: string; category: string; purpose: string; policyId: string; divisionId: number | null; departmentId: number | null; status: "SUBMITTED" | "RETURNED" | "REJECTED" };
type Event = { id: string; case_id: string; revision: number; company_id: number; requester_id: number; actor_id: number; actor_name: string; created_at: string; snapshot: Snapshot; action: string; reason: string };
export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthorityAccess(request);
    if (!actor.companyId) throw new AuthorityError("SCOPE_REQUIRED", "A verified company assignment is required.", 403);
    const section = request.nextUrl.searchParams.get("section") || "my-approvals";
    if (!["my-approvals", "finance-review", "administration-audit"].includes(section)) throw new AuthorityError("NOT_FOUND", "Unknown workspace.", 404);
    const canFinance = hasPermission(actor, "expense_authority.exception.review", actor.companyId);
    const canAudit = hasPermission(actor, "expense_authority.audit.read", actor.companyId);
    if (section === "finance-review" && !canFinance) throw new AuthorityError("FORBIDDEN", "Finance review permission is required for this workspace.", 403);
    if (section === "administration-audit" && !canAudit) throw new AuthorityError("FORBIDDEN", "Scoped audit permission is required for this workspace.", 403);
    const { workspace } = await loadWorkspace();
    const now = new Date().toISOString();
    const policies = workspace.policies.filter(p => p.companyId === actor.companyId);
    const effectivePolicies = policies.filter(p => p.status === "PUBLISHED" && p.signedReference && p.effectiveFrom && p.effectiveFrom <= now && (!p.effectiveTo || now < p.effectiveTo));
    const officers = workspace.delegations.filter(d => d.companyId === actor.companyId && d.status === "ACTIVE" && d.startsAt <= now && (!d.endsAt || now < d.endsAt));
    const assignments = officers.filter(d => d.userId === actor.id);
    const rows = await readRows<Event>("fm_isolated_expense_events", "id,case_id,revision,company_id,requester_id,actor_id,actor_name,created_at,snapshot,action,reason", { company_id: { _eq: actor.companyId } }, 500, { sort: "-created_at,-revision" });
    if (rows.length >= 500) throw new AuthorityError("CAPACITY", "Workspace event limit reached. An indexed latest-state adapter is required; incomplete data is not displayed.", 503);
    const latest = new Map<string, Event>();
    for (const event of rows) if (!latest.has(event.case_id) || latest.get(event.case_id)!.revision < event.revision) latest.set(event.case_id, event);
    const items = [...latest.values()].flatMap(event => {
      if (Number(event.company_id) !== actor.companyId) return [];
      const policy = effectivePolicies.find(p => p.id === event.snapshot.policyId);
      const tier = policy ? minimumAuthority(policy, event.snapshot.category, event.snapshot.amount) : null;
      const matches = officers.filter(d => d.tier === tier && (!d.divisionId || d.divisionId === event.snapshot.divisionId) && (!d.departmentId || d.departmentId === event.snapshot.departmentId));
      const unique = matches.length === 1 ? matches[0] : null;
      const assigned = unique?.userId === actor.id;
      // Normal inbox is not a company-wide expense browser; no client role affects scope.
      if (section === "my-approvals" && !assigned) return [];
      const checks = [
        { label: "Workflow ownership", state: "PASS", detail: "Dedicated isolated request; no shared legacy expense row." },
        { label: "Policy", state: policy ? "PASS" : "UNVERIFIED", detail: policy ? `${policy.name} · v${policy.version}` : "No current effective signed policy." },
        { label: "Assigned officer", state: unique ? "PASS" : "UNVERIFIED", detail: unique ? unique.userName : "A unique current officer is required." },
        { label: "Documents", state: "UNVERIFIED", detail: "No independently verified document/evidence adapter." },
        { label: "Available funds", state: "UNVERIFIED", detail: "No authoritative budget reservation contract." },
        { label: "Legal company ownership", state: "UNVERIFIED", detail: "Company scope was captured at creation; legal ownership evidence requires Finance confirmation." },
        { label: "Self-approval", state: event.requester_id === actor.id ? "FAIL" : "PASS", detail: event.requester_id === actor.id ? "Requester cannot decide their own request." : "Reviewer is not the requester; beneficiary/payment identities remain unverified." },
      ];
      const canDisposition = assigned && event.requester_id !== actor.id && event.snapshot.status === "SUBMITTED" && !!policy;
      return [{ ...event, categoryName: policy?.rules.find(r => r.code === event.snapshot.category)?.name || event.snapshot.category, tier, assignedOfficer: unique?.userName || "Unassigned / ambiguous", checks, canApprove: false, canDisposition, history: rows.filter(row => row.case_id === event.case_id).sort((a, b) => a.revision - b.revision) }];
    });
    return NextResponse.json({ data: { actor: { id: actor.id, name: actor.name, companyId: actor.companyId, authorities: [...new Set(assignments.map(d => d.tier))] }, capabilities: { finance: canFinance, audit: canAudit, managePolicies: hasPermission(actor, "expense_authority.policy.edit_draft", actor.companyId), manageDelegations: hasPermission(actor, "expense_authority.delegation.manage", actor.companyId) }, items, policies: section === "administration-audit" ? policies : [], assignments: section === "administration-audit" ? officers : [], counts: { pending: items.filter(i => i.snapshot.status === "SUBMITTED").length, attention: items.filter(i => i.snapshot.status === "SUBMITTED" && i.checks.some(c => c.state !== "PASS")).length, decided: items.filter(i => i.snapshot.status !== "SUBMITTED").length }, decisionsEnabled: false } }, { headers: { "Cache-Control": "no-store", Vary: "Cookie" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AuthorityError ? error.message : "Approval workspace unavailable. No financial action was performed." }, { status: error instanceof AuthorityError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
