import { TIERS } from "../types";
import type { AuthorityPolicy, AuthorityTier, Delegation, AuthorityCheck, EvaluationResult } from "../types";
import { AuthorityError } from "./authorityErrors";
import { centavos, normalizeMoney } from "./validatePolicyRules";
import { evidenceRequirements } from "./evidenceRequirements";

export interface EvaluationInput {
  policy: AuthorityPolicy; categoryCode: string; amount: string; companyId: number;
  divisionId: number | null; departmentId: number | null; coaId: number | null;
  expenseId: number | null; requesterId: number | null; beneficiaryUserId: number | null;
  decisionMakerId: number | null; businessPurpose: string | null; receiptPresent: boolean | null;
  delegations: Delegation[]; now: string;
  // Only trusted adapters may supply these values. Current V2 schema cannot establish them.
  budget: { verified: boolean; available: string | null };
  structuredEvidenceVerified: boolean; possibleSplit: boolean | null;
  sourceUpdatedAt?: string | null;
}
export function minimumAuthority(policy: AuthorityPolicy, category: string, amount: string): AuthorityTier {
  const rule = policy.rules.find(row => row.code === category);
  if (!rule) throw new AuthorityError("UNKNOWN_CATEGORY", "Select a category in the selected policy.");
  const value = centavos(amount);
  if (rule.departmentHead !== null && value <= centavos(rule.departmentHead)) return "DEPARTMENT_HEAD";
  if (value <= centavos(rule.generalManager)) return "GM";
  return value <= centavos(rule.cfo) ? "CFO" : "CEO_OWNER";
}
export function evaluateAuthority(input: EvaluationInput): EvaluationResult {
  const { policy, now } = input;
  const tier = minimumAuthority(policy, input.categoryCode, input.amount);
  const checks: AuthorityCheck[] = [];
  const check = (code: string, status: AuthorityCheck["status"], severity: AuthorityCheck["severity"], message: string) => checks.push({ code, status, severity, message });
  const withinDates = !!policy.effectiveFrom && policy.effectiveFrom <= now && (!policy.effectiveTo || now < policy.effectiveTo);
  const published = policy.status === "PUBLISHED" && withinDates;
  check("POLICY_EFFECTIVE", published ? "PASS" : "UNKNOWN", published ? "INFO" : "REVIEW", published ? "Published policy is effective." : "Policy is draft, revoked, superseded, or outside its effective dates. Preview only.");
  if (policy.companyId !== input.companyId) throw new AuthorityError("SCOPE_MISMATCH", "Policy does not apply to this company.", 403);
  check("AMOUNT_BAND", "PASS", "INFO", `Minimum monetary authority: ${tier}. This does not perform approval.`);
  const mapped = policy.rules.find(row => row.code === input.categoryCode)!.coaIds;
  const mappingValid = input.coaId !== null && mapped.includes(input.coaId);
  check("CATEGORY_MAPPING", mappingValid ? "PASS" : "UNKNOWN", mappingValid ? "INFO" : "REVIEW", mappingValid ? "COA is mapped to this category." : "Category / COA mapping is not verified.");
  const candidates = input.delegations.filter(d => d.status === "ACTIVE" && d.companyId === input.companyId &&
    d.tier === tier && d.startsAt <= now && (!d.endsAt || now < d.endsAt) &&
    (d.divisionId === null || d.divisionId === input.divisionId) && (d.departmentId === null || d.departmentId === input.departmentId));
  const candidateIds = [...new Set(candidates.map(d => d.userId))];
  check("APPROVER_ASSIGNED", candidateIds.length ? "PASS" : "UNKNOWN", candidateIds.length ? "INFO" : "REVIEW", candidateIds.length ? "Effective authority assignments found in scope." : "No effective authority assignment for the required tier and scope.");
  if (input.decisionMakerId !== null) {
    const self = input.decisionMakerId === input.requesterId || input.decisionMakerId === input.beneficiaryUserId;
    check("SELF_APPROVAL", self ? "FAIL" : input.requesterId !== null && input.beneficiaryUserId !== null ? "PASS" : "UNKNOWN",
      self ? "BLOCK" : input.requesterId === null || input.beneficiaryUserId === null ? "REVIEW" : "INFO",
      self ? "Requester or beneficiary cannot approve this expense." : "Requester / beneficiary conflict checked only where identities are verified.");
    check("DECISION_MAKER_AUTHORITY", candidateIds.includes(input.decisionMakerId) ? "PASS" : "FAIL", candidateIds.includes(input.decisionMakerId) ? "INFO" : "BLOCK", "Current reviewer must hold the required effective authority for this scope.");
  } else check("SELF_APPROVAL", "UNKNOWN", "REVIEW", "No actual approval decision-maker in simulation; self-approval cannot be cleared.");
  check("PAYMENT_SEPARATION", "UNKNOWN", "REVIEW", "Payment processor identity is not available. Separation of payment duties must be checked at financial handoff.");
  if (input.businessPurpose !== null) check("BUSINESS_PURPOSE", input.businessPurpose.trim() ? "PASS" : "FAIL", input.businessPurpose.trim() ? "INFO" : "BLOCK", input.businessPurpose.trim() ? "Purpose recorded; Finance must verify business relevance." : "Business purpose is missing.");
  else check("BUSINESS_PURPOSE", "UNKNOWN", "REVIEW", "Business purpose has not been verified.");
  check("SUPPORTING_DOCUMENT", input.receiptPresent === null ? "UNKNOWN" : input.receiptPresent ? "PASS" : "FAIL", input.receiptPresent === null ? "REVIEW" : input.receiptPresent ? "INFO" : "BLOCK", input.receiptPresent === true ? "Receipt reference recorded; authenticity still requires Finance review." : "Supporting document is missing or unverified.");
  check("CATEGORY_EVIDENCE", input.structuredEvidenceVerified ? "PASS" : "UNKNOWN", input.structuredEvidenceVerified ? "INFO" : "REVIEW", `Required: ${evidenceRequirements(input.categoryCode).join("; ")}.`);
  if (!input.budget.verified || input.budget.available === null) check("BUDGET_VERIFIED", "UNKNOWN", "REVIEW", "Available uncommitted budget is not established by a transactional backend contract. No financial clearance.");
  else {
    const sufficient = centavos(input.budget.available, true) >= centavos(input.amount);
    check("BUDGET_AVAILABLE", sufficient ? "PASS" : "FAIL", sufficient ? "INFO" : "REVIEW", sufficient ? "Verified budget covers the expense." : "Over budget: higher-authority escalation AND company-funds confirmation required. Normal tier is preserved.");
  }
  check("SPLIT_TRANSACTION", "UNKNOWN", "REVIEW", input.possibleSplit ? "Similar same-day, payee, COA and requester expenses detected; manual review required, not a misconduct finding." : "Cross-request purchase aggregation is not verified; no anti-splitting clearance.");
  check("PROCUREMENT_EXCEPTIONS", "UNKNOWN", "REVIEW", "Three-quotation triggers, emergency reporting, and procurement exceptions require Finance review; the memo supplies no numeric quotation trigger.");
  const blockingReasons = checks.filter(c => c.severity === "BLOCK" && c.status !== "PASS").map(c => c.message);
  const reviewReasons = checks.filter(c => c.severity === "REVIEW" && c.status !== "PASS").map(c => c.message);
  return { decision: blockingReasons.length ? "BLOCKED" : reviewReasons.length ? "NEEDS_REVIEW" : "ELIGIBLE",
    mode: input.expenseId === null ? "SIMULATION" : "EXISTING_EXPENSE", policyVersionId: policy.id,
    requiredAuthorityTier: tier, candidateApproverIds: candidateIds.filter(id => id !== input.requesterId && id !== input.beneficiaryUserId),
    amount: normalizeMoney(input.amount), categoryCode: input.categoryCode, expenseId: input.expenseId,
    checks, blockingReasons, reviewReasons, evaluatedAt: now, operationalApproval: false, enforcementIntegrated: false,
    policySnapshot: structuredClone(policy), inputSnapshot: {
      companyId: input.companyId, divisionId: input.divisionId, departmentId: input.departmentId, coaId: input.coaId,
      requesterId: input.requesterId, beneficiaryUserId: input.beneficiaryUserId, decisionMakerId: input.decisionMakerId,
      businessPurpose: input.businessPurpose, receiptPresent: input.receiptPresent, sourceUpdatedAt: input.sourceUpdatedAt || null,
      budget: { ...input.budget }, structuredEvidenceVerified: input.structuredEvidenceVerified, possibleSplit: input.possibleSplit,
    } };
}
export function tierIndex(tier: AuthorityTier) { return TIERS.indexOf(tier); }
