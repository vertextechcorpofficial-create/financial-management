import { createHash } from "node:crypto";
import { directus, readRows } from "../../expense-approval-authority/_lib/directus";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";
import { assertDecision, type DecisionFacts, type DecisionIntent } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/guardedDecision";

export const DECISION_COLLECTION = "fm_expense_workflow_revisions";
export interface DecisionState {
  schemaVersion: 1;
  cases: Record<string, { revision: number; state: string; ownershipRevision: number; expenseRevision: string; fingerprint: string; policyVersion: string }>;
  events: { id: string; expenseId: number; actorId: number; action: string; reason: string; createdAt: string; policyVersion: string; fingerprint: string }[];
  outbox: { id: string; expenseId: number; kind: "FINANCE_HANDOFF"; status: "PENDING" }[];
}
interface Revision { id: string; revision: number; request_key: string; payload_hash: string; state: DecisionState; outcome: unknown }
export const decisionHash = (intent: DecisionIntent) => createHash("sha256").update(JSON.stringify([intent.expenseId, intent.actorId, intent.action, intent.reason, intent.expectedExpenseRevision, intent.expectedCaseRevision, intent.expectedOwnershipRevision, intent.expectedFingerprint, intent.expectedPolicyVersion])).digest("hex");

/** Same single-INSERT/CAS pattern as authority revisions, not a series of expense PATCHes.
 * Deliberately unconnected to HTTP decisions until trusted ownership/funds adapters exist.
 * Do not invoke this from an endpoint with client-supplied DecisionFacts.
 */
export async function commitDecision(intent: DecisionIntent, facts: DecisionFacts) {
  if (facts.actorId !== intent.actorId || facts.expenseId !== intent.expenseId || !facts.permissionVerified || !facts.scopeVerified) throw new AuthorityError("FORBIDDEN", "Current actor and scope must be verified before reading a decision outcome.", 403);
  const key = `${intent.expenseId}:${intent.actorId}:${intent.idempotencyKey}`;
  const hash = decisionHash(intent);
  const prior = (await readRows<Revision>(DECISION_COLLECTION, "id,revision,payload_hash,outcome", { request_key: { _eq: key } }, 1))[0];
  if (prior) {
    if (prior.payload_hash !== hash) throw new AuthorityError("IDEMPOTENCY_CONFLICT", "This decision key was used for different content.", 409);
    // A server caller must verify authenticated actor/scope before invoking this store.
    return prior.outcome;
  }
  const nextState = assertDecision(intent, facts);
  const latest = (await readRows<Revision>(DECISION_COLLECTION, "id,revision,state", {}, 1, { sort: "-revision" }))[0];
  if (!latest || latest.state?.schemaVersion !== 1) throw new AuthorityError("INTAKE_REQUIRED", "Verified intake and ownership state must be initialized first.", 503);
  const state = structuredClone(latest.state);
  const current = state.cases[String(intent.expenseId)];
  if (!current || current.state !== "AWAITING_APPROVER" || current.revision !== intent.expectedCaseRevision || current.ownershipRevision !== intent.expectedOwnershipRevision || current.expenseRevision !== intent.expectedExpenseRevision || current.fingerprint !== intent.expectedFingerprint || current.policyVersion !== intent.expectedPolicyVersion) throw new AuthorityError("REVISION_CONFLICT", "Current workflow state differs from the reviewed request.", 409);
  const revision = latest.revision + 1;
  const eventId = `workflow-${revision}`;
  state.cases[String(intent.expenseId)] = { ...current, state: nextState, revision: current.revision + 1 };
  state.events.push({ id: eventId, expenseId: intent.expenseId, actorId: intent.actorId, action: intent.action, reason: intent.reason, policyVersion: facts.policyVersion, fingerprint: facts.fingerprint, createdAt: new Date().toISOString() });
  if (intent.action === "APPROVE") state.outbox.push({ id: `handoff:${intent.expenseId}:${current.revision + 1}`, expenseId: intent.expenseId, kind: "FINANCE_HANDOFF", status: "PENDING" });
  const outcome = { expenseId: intent.expenseId, decisionId: eventId, status: nextState, caseRevision: current.revision + 1 };
  const row = { id: eventId, revision, request_key: key, payload_hash: hash, state, outcome };
  if (Buffer.byteLength(JSON.stringify(row)) > 4_000_000) throw new AuthorityError("CAPACITY", "Workflow storage requires archival before further decisions.", 503);
  // PK(workflow-N) globally serializes state snapshots. A race loses the INSERT,
  // leaving no partial audit event, case change or downstream instruction.
  const saved = await directus<{ data: Revision }>(`items/${DECISION_COLLECTION}`, { method: "POST", body: JSON.stringify(row) });
  if (saved.data?.id !== eventId) throw new AuthorityError("WRITE_UNCONFIRMED", "Decision not confirmed. Retry the same intent key.", 503);
  return outcome;
}
