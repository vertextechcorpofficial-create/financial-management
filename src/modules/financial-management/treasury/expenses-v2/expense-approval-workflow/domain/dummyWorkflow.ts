import { PROPOSED_RULES } from "../policy-seed";
import type { IndependentExpenseEvent, IndependentExpenseSnapshot } from "../independentTypes";
import { specialRuleProblems } from "./filingSpecialRules";
import { centavos as moneyToCentavos } from "./validatePolicyRules";

export type DummyTier = "DH" | "GM" | "CFO" | "CEO";
export interface DummyConfig {
  kind: "DUMMY_WORKFLOW_CONFIG"; origin: string; enabled: boolean; companyId: number; companyName: string;
  // Legacy role IDs remain readable in existing configuration snapshots only.
  financeId?: number; officers: Record<DummyTier, number>; perRequestBudget?: string;
  policyVersion: "MEMO_FIXTURE_V1"; routing: "DIRECT_TO_TIER_TEST";
  administrators?: number[]; auditors?: number[];
}
export interface DummyReview {
  reviewerId: number; reviewedAt: string; fingerprint: string; configRevision: number;
  companyId: number; companyName: string; department: string; evidence: string; budgetEvidence?: string;
  availableFunds?: string; requiredTier: DummyTier; officerId: number;
  quotations: "NOT_REQUIRED" | "THREE_CHECKED" | "EXCEPTION_CHECKED";
}
export type DummyAction = "APPROVE" | "REJECT" | "RETURN";
export interface DummyCommand {
  action: DummyAction; reason: string;
   review?: { department: string; evidence: string; quotations: DummyReview["quotations"]; documentsChecked: boolean; companyChecked: boolean; categoryChecked: boolean; specialRulesChecked: boolean; };
}
export function dummyTier(category: string, amount: string): DummyTier {
  const rule = PROPOSED_RULES.find(row => row.code === category);
  if (!rule) throw Error("Unknown category.");
  const value = moneyToCentavos(amount);
  if (rule.departmentHead !== null && value <= moneyToCentavos(rule.departmentHead)) return "DH";
  if (value <= moneyToCentavos(rule.generalManager)) return "GM";
  if (value <= moneyToCentavos(rule.cfo)) return "CFO";
  return "CEO";
}
export function dummyTransition(current: IndependentExpenseEvent, actorId: number, input: DummyCommand, config: DummyConfig, configRevision: number, now: string): IndependentExpenseSnapshot {
  const s = current.snapshot;
  if (s.executionMode !== "DUMMY") throw Error("Only explicitly Dummy-marked requests may use test decisions.");
  if (input.reason.trim().length < 5) throw Error("A meaningful reason is required for every action.");
  if (actorId === current.requester_id) throw Error("Requesters cannot review or decide their own request.");
  if (!["APPROVE", "REJECT", "RETURN"].includes(input.action)) throw Error("Separate Finance review actions have been removed. The assigned approver reviews and decides directly.");
  const tier = dummyTier(s.category, s.amount);
  if (!["AWAITING_DECISION", "NEEDS_FINANCE_REVIEW", "ESCALATED"].includes(s.status)) throw Error("Request is not awaiting an approver decision.");
  if (actorId !== config.officers[tier]) throw Error("Only the personally assigned approver may review and decide.");
  if (input.action === "RETURN") return { ...s, status: "NEEDS_CORRECTION", dummyLastOfficerId: actorId, dummyReview: undefined };
  if (input.action === "REJECT") return { ...s, status: "REJECTED", dummyLastOfficerId: actorId };
  const finding = input.review;
  if (!finding || !finding.documentsChecked || !finding.companyChecked || !finding.categoryChecked || !finding.specialRulesChecked) throw Error("The approver must check company, category, documents and applicable special requirements before approval.");
  if (!finding.department.trim()) throw Error("The assigned approver must have a department on the request.");
  const problems = specialRuleProblems(s.category, s.specialDetails || {}, s.attachments.map(file => file.id));
  if (problems.length) throw Error(problems.join(" "));
  if (finding.quotations === "THREE_CHECKED") {
    const ids = ["quotation1", "quotation2", "quotation3"].map(key => s.specialDetails?.[key]);
    if (ids.some(id => !id || !s.attachments.some(file => file.id === id)) || new Set(ids).size !== 3) throw Error("Three distinct attached supplier quotations are required.");
  }
  if (finding.quotations === "EXCEPTION_CHECKED" && (!s.specialDetails?.purchaseException || !s.attachments.some(file => file.id === s.specialDetails?.purchaseExceptionEvidence))) throw Error("An exception claim and supporting evidence are required.");
  return { ...s, status: "APPROVED", dummyLastOfficerId: actorId, dummyReview: { ...finding, reviewerId: actorId, reviewedAt: now, fingerprint: s.fingerprint, configRevision, companyId: config.companyId, companyName: config.companyName, requiredTier: tier, officerId: actorId }, dummyHandoff: { id: `dummy:${current.case_id}`, state: "RECORDED_NOT_DISBURSED", amount: s.amount } };
}
