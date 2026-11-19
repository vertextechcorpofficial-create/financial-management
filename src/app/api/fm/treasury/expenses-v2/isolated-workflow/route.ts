import { randomUUID, createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireAuthorityAccess, assertMutationOrigin } from "../expense-approval-authority/_lib/auth";
import { directus, readRows } from "../expense-approval-authority/_lib/directus";
import { loadWorkspace } from "../expense-approval-authority/_lib/repository";
import { minimumAuthority } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/evaluateAuthority";
import { normalizeMoney } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/validatePolicyRules";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";
import { transitionProblem, isolatedRevisionKey } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/isolatedTransitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COLLECTION = "fm_isolated_expense_events";
const fields = "id,case_id,revision,company_id,requester_id,actor_id,actor_name,request_key,payload_hash,created_at,snapshot,action,reason";
interface Snapshot { amount: string; category: string; purpose: string; policyId: string; divisionId: number | null; departmentId: number | null; status: "SUBMITTED" | "RETURNED" | "REJECTED"; }
interface Event { id: string; case_id: string; revision: number; company_id: number; requester_id: number; actor_id: number; actor_name: string; request_key: string; payload_hash: string; created_at: string; snapshot: Snapshot; action: string; reason: string; }
const form = z.object({ amount: z.string(), category: z.string().min(1).max(80), purpose: z.string().trim().min(10).max(2000), policyId: z.string().min(1).max(80), divisionId: z.number().int().positive().nullable(), departmentId: z.number().int().positive().nullable() }).strict();
const command = z.object({ action: z.enum(["CREATE", "RESUBMIT", "RETURN", "REJECT", "APPROVE"]), requestKey: z.string().uuid(), caseId: z.string().uuid().optional(), revision: z.number().int().positive().optional(), reason: z.string().trim().min(5).max(2000), form: form.optional() }).strict();
function fail(error: unknown) {
  return NextResponse.json({ error: error instanceof AuthorityError ? error.message : error instanceof z.ZodError ? "Invalid request fields." : "Isolated workflow unavailable; no successful write is assumed." }, { status: error instanceof AuthorityError ? error.status : error instanceof z.ZodError ? 400 : 503, headers: { "Cache-Control": "no-store" } });
}
export async function GET(request: NextRequest) {
  try {
    const actor = await requireAuthorityAccess(request);
    if (!actor.companyId) throw new AuthorityError("SCOPE_REQUIRED", "An assigned company is required.", 403);
    const { workspace } = await loadWorkspace();
    const now = new Date().toISOString();
    const policies = workspace.policies.filter(p => p.companyId === actor.companyId && p.status === "PUBLISHED" && !!p.signedReference && p.effectiveFrom && p.effectiveFrom <= now && (!p.effectiveTo || now < p.effectiveTo));
    const assignments = workspace.delegations.filter(d => d.userId === actor.id && d.companyId === actor.companyId && d.status === "ACTIVE" && d.startsAt <= now && (!d.endsAt || now < d.endsAt));
    const caseId = request.nextUrl.searchParams.get("caseId");
    if (caseId && !z.string().uuid().safeParse(caseId).success) throw new AuthorityError("INVALID_QUERY", "Invalid case ID.");
    // Requesters can read their records. Officers can read only matching scoped tiers.
    const rows = await readRows<Event>(COLLECTION, fields, { company_id: { _eq: actor.companyId }, ...(caseId ? { case_id: { _eq: caseId } } : {}) }, 500, { sort: "-created_at,-revision" });
    if (rows.length === 500) throw new AuthorityError("CAPACITY", "Isolated ledger read limit reached; archival/paginated index integration is required.", 503);
    const latest = new Map<string, Event>();
    for (const row of rows) if (!latest.has(row.case_id) || latest.get(row.case_id)!.revision < row.revision) latest.set(row.case_id, row);
    const items = [...latest.values()].flatMap(row => {
      const policy = policies.find(p => p.id === row.snapshot.policyId);
      const tier = policy ? minimumAuthority(policy, row.snapshot.category, row.snapshot.amount) : null;
      const scopedOfficers = workspace.delegations.filter(d => d.companyId === actor.companyId && d.tier === tier && d.status === "ACTIVE" && d.startsAt <= now && (!d.endsAt || now < d.endsAt) && (!d.divisionId || d.divisionId === row.snapshot.divisionId) && (!d.departmentId || d.departmentId === row.snapshot.departmentId));
      const eligible = scopedOfficers.length === 1 && scopedOfficers[0].userId === actor.id && assignments.some(d => d.id === scopedOfficers[0].id);
      if (row.requester_id !== actor.id && !eligible) return [];
      return [{ ...row, tier, canReview: eligible && row.requester_id !== actor.id && row.snapshot.status === "SUBMITTED", history: rows.filter(e => e.case_id === row.case_id).sort((a, b) => a.revision - b.revision) }];
    });
    return NextResponse.json({ data: { actorId: actor.id, companyId: actor.companyId, items, policies, approvalBlocker: "Budget reservation, category evidence and payment-duty verification have no authoritative adapter. Approval and disbursement are disabled." } }, { headers: { "Cache-Control": "no-store" } });
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
      if (input.form.departmentId && !input.form.divisionId) throw new AuthorityError("INVALID_SCOPE", "Department requires a division.");
      if (input.form.divisionId) {
        const division = await readRows("division", "division_id", { division_id: { _eq: input.form.divisionId } }, 1);
        if (!division.length) throw new AuthorityError("INVALID_SCOPE", "Division does not exist.");
      }
      if (input.form.departmentId) {
        const department = await readRows("department", "department_id", { department_id: { _eq: input.form.departmentId }, parent_division: { _eq: input.form.divisionId } }, 1);
        if (!department.length) throw new AuthorityError("INVALID_SCOPE", "Department does not belong to the selected division.");
      }
      snapshot = { ...input.form, amount, status: "SUBMITTED" };
    } else {
      if (!current || current.snapshot.status !== "SUBMITTED" || current.requester_id === actor.id) throw new AuthorityError("FORBIDDEN", "Request must be submitted and cannot be decided by its requester.", 403);
      const policy = workspace.policies.find(p => p.id === current.snapshot.policyId && p.companyId === actor.companyId && p.status === "PUBLISHED" && p.effectiveFrom && p.effectiveFrom <= now && (!p.effectiveTo || now < p.effectiveTo));
      if (!policy) throw new AuthorityError("POLICY_REQUIRED", "Policy is no longer effective; Finance intervention is required.", 422);
      const tier = minimumAuthority(policy, current.snapshot.category, current.snapshot.amount);
      const officers = workspace.delegations.filter(d => d.companyId === actor.companyId && d.tier === tier && d.status === "ACTIVE" && d.startsAt <= now && (!d.endsAt || now < d.endsAt) && (!d.divisionId || d.divisionId === current.snapshot.divisionId) && (!d.departmentId || d.departmentId === current.snapshot.departmentId));
      if (officers.length !== 1 || officers[0].userId !== actor.id) throw new AuthorityError("FORBIDDEN", "A unique current officer assignment is required.", 403);
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
