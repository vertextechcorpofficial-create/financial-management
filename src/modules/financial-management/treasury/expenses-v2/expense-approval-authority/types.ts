export const TIERS = ["DEPARTMENT_HEAD", "GM", "CFO", "CEO_OWNER"] as const;
export type AuthorityTier = (typeof TIERS)[number];
export type PolicyStatus = "DRAFT" | "PENDING_RATIFICATION" | "PUBLISHED" | "SUPERSEDED" | "REVOKED";
export interface AuthorityRule {
  code: string; name: string; page: number;
  departmentHead: string | null; generalManager: string; cfo: string;
  coaIds: number[];
}
export interface AuthorityPolicy {
  id: string; name: string; version: number; companyId: number; status: PolicyStatus;
  effectiveFrom: string | null; effectiveTo: string | null;
  signedReference: string | null; ratifiedBy: number | null; ratifiedAt: string | null;
  createdBy: number; createdAt: string; rules: AuthorityRule[];
}
export interface Delegation {
  id: string; companyId: number; userId: number; userName: string; tier: AuthorityTier;
  divisionId: number | null; departmentId: number | null;
  startsAt: string; endsAt: string | null; status: "ACTIVE" | "REVOKED";
  reason: string; createdBy: number; revokedAt: string | null;
}
export interface PolicyException {
  id: string; companyId: number; evaluationId: string; expenseId: number | null;
  policyId: string; summary: string; codes: string[];
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
  resolution: string | null; updatedBy: number; updatedAt: string;
}
export interface AuthorityWorkspace {
  schemaVersion: 1; policies: AuthorityPolicy[]; delegations: Delegation[]; exceptions: PolicyException[];
}
export type AuthorityPermission =
  | "expense_authority.policy.read" | "expense_authority.policy.create" | "expense_authority.policy.edit_draft"
  | "expense_authority.policy.submit" | "expense_authority.policy.ratify" | "expense_authority.policy.publish"
  | "expense_authority.policy.revoke" | "expense_authority.delegation.manage"
  | "expense_authority.evaluation.run" | "expense_authority.evaluation.save"
  | "expense_authority.exception.review" | "expense_authority.audit.read"
  | "expense_authority.ui.overview" | "expense_authority.ui.authority-matrix" | "expense_authority.ui.delegations"
  | "expense_authority.ui.evaluation" | "expense_authority.ui.exceptions" | "expense_authority.ui.audit-history";
export interface AuthorityGrant { permission: AuthorityPermission; companyId: number | null }
export interface AuthorityActor { id: number; name: string; email: string; companyId: number | null; admin: boolean; grants: AuthorityGrant[] }
export interface AuthorityCheck {
  code: string; status: "PASS" | "FAIL" | "UNKNOWN";
  severity: "INFO" | "REVIEW" | "BLOCK"; message: string;
}
export interface EvaluationResult {
  decision: "ELIGIBLE" | "BLOCKED" | "NEEDS_REVIEW";
  mode: "SIMULATION" | "EXISTING_EXPENSE"; policyVersionId: string;
  requiredAuthorityTier: AuthorityTier; candidateApproverIds: number[];
  amount: string; categoryCode: string; expenseId: number | null;
  checks: AuthorityCheck[]; blockingReasons: string[]; reviewReasons: string[];
  evaluatedAt: string; operationalApproval: false; enforcementIntegrated: false;
  policySnapshot: AuthorityPolicy;
  inputSnapshot: {
    companyId: number; divisionId: number | null; departmentId: number | null; coaId: number | null;
    requesterId: number | null; beneficiaryUserId: number | null; decisionMakerId: number | null;
    businessPurpose: string | null; receiptPresent: boolean | null; sourceUpdatedAt: string | null;
    budget: { verified: boolean; available: string | null }; structuredEvidenceVerified: boolean; possibleSplit: boolean | null;
  };
}
export interface AuditEvent {
  action: string; entityId: string; companyId: number; reason: string;
  before: unknown; after: unknown;
}
export interface AuthorityRevision {
  id: string; revision: number; request_id: string; request_hash: string;
  actor_id: number; actor_name: string; company_id: number;
  created_at: string; workspace: AuthorityWorkspace; event: AuditEvent;
}
export interface AuthorityContext {
  actor: AuthorityActor; revision: number; workspace: AuthorityWorkspace;
  storage: "READY" | "UNAVAILABLE";
  capabilities: { managePolicies: boolean; manageDelegations: boolean; reviewExceptions: boolean; evaluate: boolean; saveEvaluations: boolean; readAudit: boolean; publishPolicy: boolean; revokePolicy: boolean };
  integration: { enforcementIntegrated: false; budgetVerified: false; evidenceStructured: false };
}
export interface ReferenceOption { id: number; name: string; companyId?: number | null; divisionId?: number | null }
export const TIER_LABELS: Record<AuthorityTier, string> = {
  DEPARTMENT_HEAD: "Department Head", GM: "General Manager", CFO: "CFO", CEO_OWNER: "CEO / Owner",
};
