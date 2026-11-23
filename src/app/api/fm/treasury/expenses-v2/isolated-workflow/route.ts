import { randomUUID, createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuthorityAccess, assertMutationOrigin } from "../expense-approval-authority/_lib/auth";
import { directus, enabled, readRows } from "../expense-approval-authority/_lib/directus";
import { loadWorkspace } from "../expense-approval-authority/_lib/repository";
import { minimumAuthority } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/evaluateAuthority";
import { normalizeMoney } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/validatePolicyRules";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";
import { transitionProblem, isolatedRevisionKey } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/isolatedTransitions";
import { resolveOfficer } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/organizationalRouting";
import type { AuthorityTier, Delegation } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COLLECTION = "fm_isolated_expense_events";
const fields = "id,case_id,revision,company_id,requester_id,actor_id,actor_name,request_key,payload_hash,created_at,snapshot,action,reason";
interface Snapshot { amount: string; category: string; purpose: string; policyId: string; divisionId: number | null; departmentId: number | null; accountScoped?: true; status: "SUBMITTED" | "RETURNED" | "REJECTED"; }
interface Event { id: string; case_id: string; revision: number; company_id: number; requester_id: number; actor_id: number; actor_name: string; request_key: string; payload_hash: string; created_at: string; snapshot: Snapshot; action: string; reason: string; }
const form = z.object({ amount: z.string(), category: z.string().min(1).max(80), purpose: z.string().trim().min(10).max(2000), policyId: z.string().min(1).max(80) }).strict();
const command = z.object({ action: z.enum(["CREATE", "RESUBMIT", "RETURN", "REJECT", "APPROVE"]), requestKey: z.string().uuid(), caseId: z.string().uuid().optional(), revision: z.number().int().positive().optional(), reason: z.string().trim().min(5).max(2000), form: form.optional() }).strict();
function fail(error: unknown) {
  return NextResponse.json({ error: error instanceof AuthorityError ? error.message : error instanceof z.ZodError ? "Invalid request fields." : "Isolated workflow unavailable; no successful write is assumed." }, { status: error instanceof AuthorityError ? error.status : error instanceof z.ZodError ? 400 : 503, headers: { "Cache-Control": "no-store" } });
}
function positiveId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
async function accountDepartment(userId: number, companyId: number) {
  const [user] = await readRows<{ user_department: number | null }>("user", "user_department", { user_id: { _eq: userId }, company_id: { _eq: companyId } }, 1);
  return positiveId(user?.user_department);
}
async function department(id: number) {
  const [row] = await readRows<{ department_head_id: number | null; parent_division: number | null }>("department", "department_head_id,parent_division", { department_id: { _eq: id }, is_delete: { _eq: 0 } }, 1);
  return row;
}
function officerLookup(delegations: Delegation[], now: string) {
  const cache = new Map<string, Promise<number | null>>();
  return (companyId: number, requesterId: number, snapshot: Snapshot, tier: AuthorityTier | null) => {
    const departmentId = snapshot.departmentId;
    if (!snapshot.accountScoped || !tier || !departmentId) return Promise.resolve(null);
    const key = JSON.stringify([companyId, requesterId, departmentId, snapshot.divisionId, tier]);
    const lookup = async () => {
      const row = await department(departmentId);
      if (!row) return null;
      const id = resolveOfficer({ tier, companyId, departmentId, divisionId: snapshot.divisionId, departmentHeadId: positiveId(row.department_head_id), requesterId, delegations, now });
      if (!id) return null;
      const [user] = await readRows<{ user_department: number | null; is_deleted: unknown; isDeleted: unknown; is_blocked: unknown }>("user", "user_department,is_deleted,isDeleted,is_blocked", { user_id: { _eq: id }, company_id: { _eq: companyId } }, 1);
      return user && !enabled(user.is_deleted) && !enabled(user.isDeleted) && !enabled(user.is_blocked) &&
        (tier !== "DEPARTMENT_HEAD" || positiveId(user.user_department) === departmentId) ? id : null;
    };
    if (!cache.has(key)) cache.set(key, lookup());
    return cache.get(key)!;
  };
}
function approvalAccess(actor: { id: number; position: string | null }, departmentHeadId: number | null): { tiers: AuthorityTier[]; canFileRequests: boolean } {
  const title = (actor.position || "").toLowerCase();
  const tiers: AuthorityTier[] = [];
  if (departmentHeadId === actor.id || title.includes("department head")) tiers.push("DEPARTMENT_HEAD");
  if (title.includes("general manager")) tiers.push("GM");
  if (title.includes("cfo") || title.includes("finance head")) tiers.push("CFO");
  if (title.includes("ceo") || title.includes("owner")) tiers.push("CEO_OWNER");
  return { tiers: [...new Set(tiers)], canFileRequests: !tiers.includes("CEO_OWNER") };
}
export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthorityAccess(request);
    if (!actor.companyId) throw new AuthorityError("SCOPE_REQUIRED", "An assigned company is required.", 403);
    const { workspace } = await loadWorkspace();
    const now = new Date().toISOString();
    const policies = workspace.policies.filter(p => p.companyId === actor.companyId && p.status === "PUBLISHED" && !!p.signedReference && p.effectiveFrom && p.effectiveFrom <= now && (!p.effectiveTo || now < p.effectiveTo));
    const lookup = officerLookup(workspace.delegations, now);
    const departmentId = await accountDepartment(actor.id, actor.companyId);
    const departmentRow = departmentId ? await department(departmentId) : null;
    const access = approvalAccess(actor, positiveId(departmentRow?.department_head_id));
    const caseId = request.nextUrl.searchParams.get("caseId");
    if (caseId && !z.string().uuid().safeParse(caseId).success) throw new AuthorityError("INVALID_QUERY", "Invalid case ID.");
    // Requesters can read their records. Officers can read only matching scoped tiers.
    const rows = await readRows<Event>(COLLECTION, fields, { company_id: { _eq: actor.companyId }, ...(caseId ? { case_id: { _eq: caseId } } : {}) }, 500, { sort: "-created_at,-revision" });
    if (rows.length === 500) throw new AuthorityError("CAPACITY", "Isolated ledger read limit reached; archival/paginated index integration is required.", 503);
    const latest = new Map<string, Event>();
    for (const row of rows) if (!latest.has(row.case_id) || latest.get(row.case_id)!.revision < row.revision) latest.set(row.case_id, row);
    const items = [];
    for (const row of latest.values()) {
      const policy = policies.find(p => p.id === row.snapshot.policyId);
      const tier = policy ? minimumAuthority(policy, row.snapshot.category, row.snapshot.amount) : null;
      const approverId = await lookup(actor.companyId, row.requester_id, row.snapshot, tier);
      const eligible = approverId === actor.id;
      if (row.requester_id !== actor.id && !eligible) continue;
      items.push({ ...row, tier, approverId, canReview: eligible && row.snapshot.status === "SUBMITTED", history: rows.filter(e => e.case_id === row.case_id).sort((a, b) => a.revision - b.revision) });
    }
    return NextResponse.json({ data: { actorId: actor.id, companyId: actor.companyId, departmentId, approvalTiers: access.tiers, canFileRequests: access.canFileRequests, items, policies, approvalBlocker: "Budget reservation, category evidence and payment-duty verification have no authoritative adapter. Approval and disbursement are disabled." } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}
export async function POST(request: NextRequest) {
  try {
    assertMutationOrigin(request);
    const actor = await requireAuthorityAccess(request);
    if (!actor.companyId) throw new AuthorityError("SCOPE_REQUIRED", "An assigned company is required.", 403);
    const text = await request.text();
    if (Buffer.byteLength(text) > 20000) throw new AuthorityError("TOO_LARGE", "Request exceeds 20 KB.", 413);
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new AuthorityError("INVALID_JSON", "Request must contain valid JSON."); }
    const input = command.parse(parsed);
    const key = `${actor.id}:${input.requestKey}`;
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const prior = (await readRows<Event>(COLLECTION, fields, { request_key: { _eq: key }, actor_id: { _eq: actor.id }, company_id: { _eq: actor.companyId } }, 1))[0];
    if (prior) {
      if (prior.payload_hash !== hash) throw new AuthorityError("CONFLICT", "Request key was used for different content.", 409);
      return NextResponse.json({ data: { caseId: prior.case_id, revision: prior.revision, replayed: true } });
    }
    if (input.action === "APPROVE") throw new AuthorityError("CONTROL_UNVERIFIED", "Approval requires authoritative budget, evidence and payment-separation adapters; no approval or disbursement was performed.", 422);
    const current = input.caseId ? (await readRows<Event>(COLLECTION, fields, { case_id: { _eq: input.caseId }, company_id: { _eq: actor.companyId } }, 1, { sort: "-revision" }))[0] : null;
    if (input.action !== "CREATE" && (!current || current.revision !== input.revision)) throw new AuthorityError("REVISION_CONFLICT", "Request changed or is outside your scope. Refresh before retrying.", 409);
    if (input.action === "CREATE" && (input.caseId || input.revision)) throw new AuthorityError("INVALID_REQUEST", "New requests must not specify existing case identifiers.");
    const now = new Date().toISOString();
    const { workspace } = await loadWorkspace();
    let snapshot: Snapshot;
    if (input.action === "CREATE" || input.action === "RESUBMIT") {
      if (current && (current.requester_id !== actor.id || current.snapshot.status !== "RETURNED")) throw new AuthorityError("FORBIDDEN", "Only the requester may resubmit a returned request.", 403);
      if (!input.form) throw new AuthorityError("INVALID_REQUEST", "Request details are required.");
      const policy = workspace.policies.find(p => p.id === input.form!.policyId && p.companyId === actor.companyId && p.status === "PUBLISHED" && p.signedReference && p.effectiveFrom && p.effectiveFrom <= now && (!p.effectiveTo || now < p.effectiveTo));
      if (!policy) throw new AuthorityError("POLICY_REQUIRED", "Choose a currently effective signed policy.", 422);
      const amount = normalizeMoney(input.form.amount);
      minimumAuthority(policy, input.form.category, amount);
      const departmentId = await accountDepartment(actor.id, actor.companyId);
      const row = departmentId ? await department(departmentId) : null;
      if (!row || !departmentId) throw new AuthorityError("INVALID_SCOPE", "Your account must be assigned to an active department.", 422);
      const links = await readRows<{ division_id: number }>("department_per_division", "division_id", { department_id: { _eq: departmentId } }, 100);
      const divisions = new Set([row.parent_division, ...links.map(link => link.division_id)].map(positiveId).filter(id => id !== null));
      snapshot = { ...input.form, amount, departmentId, divisionId: divisions.size === 1 ? [...divisions][0] : null, accountScoped: true, status: "SUBMITTED" };
    } else {
      if (!current || current.snapshot.status !== "SUBMITTED" || current.requester_id === actor.id) throw new AuthorityError("FORBIDDEN", "Request must be submitted and cannot be decided by its requester.", 403);
      const policy = workspace.policies.find(p => p.id === current.snapshot.policyId && p.companyId === actor.companyId && p.status === "PUBLISHED" && p.effectiveFrom && p.effectiveFrom <= now && (!p.effectiveTo || now < p.effectiveTo));
      if (!policy) throw new AuthorityError("POLICY_REQUIRED", "Policy is no longer effective; Finance intervention is required.", 422);
      const tier = minimumAuthority(policy, current.snapshot.category, current.snapshot.amount);
      const officer = await officerLookup(workspace.delegations, now)(actor.companyId, current.requester_id, current.snapshot, tier);
      if (officer !== actor.id) throw new AuthorityError("FORBIDDEN", "A unique current officer assignment is required.", 403);
      snapshot = { ...current.snapshot, status: input.action === "RETURN" ? "RETURNED" : "REJECTED" };
    }
    const caseId = current?.case_id || randomUUID(), revision = (current?.revision || 0) + 1;
    const problem = transitionProblem({ action: input.action, current: current ? { revision: current.revision, requesterId: current.requester_id, status: current.snapshot.status } : null, expectedRevision: input.revision, actorId: actor.id, uniqueAssignedOfficer: input.action === "RETURN" || input.action === "REJECT" });
    if (problem) throw new AuthorityError("INVALID_TRANSITION", problem.message, problem.status);
    const event: Event = { id: isolatedRevisionKey(caseId, revision), case_id: caseId, revision, company_id: actor.companyId, requester_id: current?.requester_id || actor.id, actor_id: actor.id, actor_name: actor.name, request_key: key, payload_hash: hash, created_at: now, snapshot, action: input.action, reason: input.reason };
    // One append stores state + audit. Unique primary key(case:revision) resolves races.
    // This collection is never read by legacy V2; no shared expense/payment rows exist.
    const saved = await directus<{ data: Event }>(`items/${COLLECTION}`, { method: "POST", body: JSON.stringify(event) });
    if (saved.data?.id !== event.id) throw new AuthorityError("UNCONFIRMED", "Write not confirmed. Retry the same request key.", 503);
    return NextResponse.json({ data: { caseId, revision } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fail(error); }
}
