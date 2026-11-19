import { PROPOSED_RULES } from "../policy-seed";
import type { AuthorityActor, AuthorityWorkspace, AuthorityPolicy, Delegation, AuditEvent, AuthorityRule } from "../types";
import { AuthorityError } from "./authorityErrors";
import { validatePolicyRules } from "./validatePolicyRules";

export const emptyWorkspace = (): AuthorityWorkspace => ({ schemaVersion: 1, policies: [], delegations: [], exceptions: [] });
export type WorkspaceCommand =
  | { action: "CREATE_POLICY"; companyId: number; name: string; sourceId?: string; reason: string }
  | { action: "UPDATE_POLICY"; id: string; name: string; rules: AuthorityRule[]; reason: string }
  | { action: "SUBMIT_POLICY"; id: string; reason: string }
  | { action: "PUBLISH_POLICY"; id: string; effectiveFrom: string; effectiveTo: string | null; signedReference: string; authorized: true; reason: string }
  | { action: "REVOKE_POLICY"; id: string; reason: string }
  | { action: "CREATE_DELEGATION"; companyId: number; userId: number; tier: Delegation["tier"]; divisionId: number | null; departmentId: number | null; startsAt: string; endsAt: string | null; reason: string }
  | { action: "REVOKE_DELEGATION"; id: string; reason: string }
  | { action: "RESOLVE_EXCEPTION"; id: string; status: "IN_REVIEW" | "RESOLVED" | "DISMISSED"; reason: string };

function dates(start: string, end: string | null) {
  if (!Number.isFinite(Date.parse(start)) || (end !== null && (!Number.isFinite(Date.parse(end)) || end <= start))) {
    throw new AuthorityError("INVALID_DATES", "End must be later than start; use valid UTC timestamps.");
  }
}
function overlaps(a: string, b: string | null, c: string, d: string | null) {
  return (!d || a < d) && (!b || c < b);
}
export function applyCommand(current: AuthorityWorkspace, command: WorkspaceCommand, actor: AuthorityActor,
  now: string, newId: string, verifiedUserName = ""): { workspace: AuthorityWorkspace; event: AuditEvent } {
  if (!command.reason?.trim()) throw new AuthorityError("REASON_REQUIRED", "An audit reason is required.");
  const state = structuredClone(current);
  let before: unknown = null, after: unknown = null, entityId = newId, companyId = 0;
  if (command.action === "CREATE_POLICY") {
    const source = command.sourceId ? state.policies.find(p => p.id === command.sourceId) : null;
    if (command.sourceId && (!source || source.companyId !== command.companyId)) throw new AuthorityError("INVALID_SOURCE", "Source policy must belong to the selected company.");
    const policy: AuthorityPolicy = { id: newId, name: command.name.trim(), companyId: command.companyId,
      version: Math.max(0, ...state.policies.filter(p => p.companyId === command.companyId).map(p => p.version)) + 1,
      status: "DRAFT", effectiveFrom: null, effectiveTo: null, signedReference: null, ratifiedBy: null, ratifiedAt: null,
      createdBy: actor.id, createdAt: now, rules: structuredClone(source?.rules || PROPOSED_RULES) };
    state.policies.push(policy); after = policy; companyId = policy.companyId;
  } else if (["UPDATE_POLICY", "SUBMIT_POLICY", "PUBLISH_POLICY", "REVOKE_POLICY"].includes(command.action)) {
    const c = command as Exclude<WorkspaceCommand, { action: "CREATE_POLICY" | "CREATE_DELEGATION" | "REVOKE_DELEGATION" | "RESOLVE_EXCEPTION" }>;
    const policy = state.policies.find(p => p.id === c.id);
    if (!policy) throw new AuthorityError("NOT_FOUND", "Policy not found.", 404);
    before = structuredClone(policy); entityId = policy.id; companyId = policy.companyId;
    if (c.action === "UPDATE_POLICY") {
      if (policy.status !== "DRAFT") throw new AuthorityError("IMMUTABLE_POLICY", "Only drafts can be edited. Clone this version to make changes.", 409);
      policy.rules = validatePolicyRules(c.rules); policy.name = c.name.trim();
    } else if (c.action === "SUBMIT_POLICY") {
      if (policy.status !== "DRAFT") throw new AuthorityError("INVALID_TRANSITION", "Only drafts may be submitted for ratification.", 409);
      validatePolicyRules(policy.rules); policy.status = "PENDING_RATIFICATION";
    } else if (c.action === "PUBLISH_POLICY") {
      if (policy.status !== "PENDING_RATIFICATION") throw new AuthorityError("INVALID_TRANSITION", "Submit the draft for ratification before publishing.", 409);
      if (c.authorized !== true || !c.signedReference.trim()) throw new AuthorityError("RATIFICATION_REQUIRED", "Signed-policy reference and explicit management authorization are required.");
      dates(c.effectiveFrom, c.effectiveTo);
      if (c.effectiveFrom < now) throw new AuthorityError("BACKDATED_POLICY", "Publication cannot be backdated. Choose a future effective time.");
      if (state.policies.some(p => p.id !== policy.id && p.companyId === policy.companyId && p.status === "PUBLISHED" &&
        p.effectiveFrom && overlaps(c.effectiveFrom, c.effectiveTo, p.effectiveFrom, p.effectiveTo))) {
        throw new AuthorityError("POLICY_OVERLAP", "Another published policy overlaps this period. Revoke it explicitly or choose a non-overlapping period.", 409);
      }
      validatePolicyRules(policy.rules); policy.status = "PUBLISHED";
      policy.effectiveFrom = c.effectiveFrom; policy.effectiveTo = c.effectiveTo;
      policy.signedReference = c.signedReference.trim(); policy.ratifiedBy = actor.id; policy.ratifiedAt = now;
    } else {
      if (policy.status === "REVOKED" || policy.status === "SUPERSEDED") throw new AuthorityError("INVALID_TRANSITION", "Policy is already inactive.", 409);
      policy.status = "REVOKED";
    }
    after = structuredClone(policy);
  } else if (command.action === "CREATE_DELEGATION") {
    dates(command.startsAt, command.endsAt);
    if (command.departmentId && !command.divisionId) throw new AuthorityError("INVALID_SCOPE", "Department assignments require a division.");
    if (command.tier === "DEPARTMENT_HEAD" && !command.departmentId) throw new AuthorityError("INVALID_SCOPE", "Department Head authority requires a department scope.");
    const conflicts = state.delegations.some(d => d.status === "ACTIVE" && d.companyId === command.companyId && d.tier === command.tier &&
      (d.divisionId === null || command.divisionId === null || d.divisionId === command.divisionId) &&
      (d.departmentId === null || command.departmentId === null || d.departmentId === command.departmentId) &&
      overlaps(d.startsAt, d.endsAt, command.startsAt, command.endsAt));
    if (conflicts) throw new AuthorityError("DELEGATION_OVERLAP", "This tier already has an overlapping authority assignment in the selected scope and period.", 409);
    const delegation: Delegation = { id: newId, companyId: command.companyId, userId: command.userId,
      userName: verifiedUserName, tier: command.tier, divisionId: command.divisionId, departmentId: command.departmentId,
      startsAt: command.startsAt, endsAt: command.endsAt, status: "ACTIVE", reason: command.reason.trim(), createdBy: actor.id, revokedAt: null };
    state.delegations.push(delegation); after = delegation; companyId = delegation.companyId;
  } else if (command.action === "REVOKE_DELEGATION") {
    const delegation = state.delegations.find(d => d.id === command.id);
    if (!delegation) throw new AuthorityError("NOT_FOUND", "Authority assignment not found.", 404);
    if (delegation.status === "REVOKED") throw new AuthorityError("INVALID_TRANSITION", "Assignment is already revoked.", 409);
    before = structuredClone(delegation); delegation.status = "REVOKED"; delegation.revokedAt = now;
    after = delegation; entityId = delegation.id; companyId = delegation.companyId;
  } else if (command.action === "RESOLVE_EXCEPTION") {
    const exception = state.exceptions.find(e => e.id === command.id);
    if (!exception) throw new AuthorityError("NOT_FOUND", "Exception not found.", 404);
    if (exception.status === "RESOLVED" || exception.status === "DISMISSED") throw new AuthorityError("INVALID_TRANSITION", "Closed exceptions are immutable; run a new evaluation to open a new finding.", 409);
    before = structuredClone(exception); exception.status = command.status; exception.resolution = command.reason.trim();
    exception.updatedAt = now; exception.updatedBy = actor.id;
    after = exception; entityId = exception.id; companyId = exception.companyId;
  }
  if (state.policies.length > 500 || state.delegations.length > 2000 || state.exceptions.length > 5000) {
    throw new AuthorityError("WORKSPACE_CAPACITY", "Workspace capacity reached; archive/export through an approved backend migration.", 409);
  }
  return { workspace: state, event: { action: command.action, entityId, companyId, reason: command.reason.trim(), before, after } };
}
