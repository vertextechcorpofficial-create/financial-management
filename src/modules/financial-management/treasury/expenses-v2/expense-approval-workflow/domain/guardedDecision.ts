import { AuthorityError } from "./authorityErrors";

export type DecisionAction = "APPROVE" | "REJECT" | "RETURN_WITH_CONCERN";
export interface DecisionIntent {
  expenseId: number; actorId: number; action: DecisionAction; reason: string; idempotencyKey: string;
  expectedExpenseRevision: string; expectedCaseRevision: number; expectedOwnershipRevision: number;
  expectedFingerprint: string; expectedPolicyVersion: string;
}
/** Facts must come from a trusted server adapter, never from request JSON. */
export interface DecisionFacts {
  expenseId: number; actorId: number; requesterId: number; beneficiaryId: number | null;
  companyVerified: boolean; permissionVerified: boolean; scopeVerified: boolean;
  uniqueAssignedOfficerId: number | null; owner: string; ownershipRevision: number;
  caseRevision: number; expenseRevision: string; fingerprint: string; policyVersion: string;
  evaluationCurrent: boolean; policyApproved: boolean; state: string;
  conflictIdentitiesVerified: boolean;
  documentsVerified: boolean; fundsVerified: boolean; paymentSeparationVerified: boolean;
  sharedLegacyGuardVerified: boolean; reliableHandoffVerified: boolean;
}
export function assertDecision(intent: DecisionIntent, facts: DecisionFacts) {
  if (!["APPROVE", "REJECT", "RETURN_WITH_CONCERN"].includes(intent.action)) throw new AuthorityError("INVALID_ACTION", "Invalid decision action.", 400);
  if (!intent.idempotencyKey || !Number.isSafeInteger(intent.expenseId) || intent.expenseId <= 0) throw new AuthorityError("INVALID_INTENT", "Invalid decision intent.", 400);
  if (facts.actorId !== intent.actorId || facts.expenseId !== intent.expenseId || !facts.permissionVerified || !facts.scopeVerified || facts.uniqueAssignedOfficerId !== intent.actorId) throw new AuthorityError("FORBIDDEN", "The current officer assignment does not permit this decision.", 403);
  if (facts.requesterId === intent.actorId || facts.beneficiaryId === intent.actorId) throw new AuthorityError("SELF_APPROVAL", "Requester or beneficiary cannot decide their own expense.", 403);
  if (!facts.companyVerified || !facts.sharedLegacyGuardVerified || !facts.reliableHandoffVerified) throw new AuthorityError("INTEGRATION_REQUIRED", "Authoritative company ownership, shared legacy exclusion and reliable handoff are required.", 503);
  if (facts.owner !== "OPTION_B" || facts.state !== "AWAITING_APPROVER") throw new AuthorityError("STATE_CONFLICT", "The expense is no longer owned by this pending approval workflow.", 409);
  if (intent.expectedExpenseRevision !== facts.expenseRevision || intent.expectedCaseRevision !== facts.caseRevision || intent.expectedOwnershipRevision !== facts.ownershipRevision || intent.expectedFingerprint !== facts.fingerprint || intent.expectedPolicyVersion !== facts.policyVersion || !facts.evaluationCurrent) throw new AuthorityError("REVISION_CONFLICT", "Expense, ownership, policy or evaluation changed. Refresh and deliberately review again.", 409);
  if (!facts.policyApproved || !facts.documentsVerified || !facts.fundsVerified || !facts.paymentSeparationVerified || !facts.conflictIdentitiesVerified) throw new AuthorityError("CONTROL_UNVERIFIED", "Required policy, identities, evidence, funds and separation-of-duties checks are not verified.", 422);
  if (intent.reason.trim().length < 10) throw new AuthorityError("REASON_REQUIRED", "Enter a meaningful decision reason of at least 10 characters.", 422);
  return intent.action === "APPROVE" ? "APPROVED" : intent.action === "REJECT" ? "REJECTED" : "RETURNED_WITH_CONCERN";
}
