import { PROPOSED_RULES } from "../policy-seed";
import type { AuthorityTier } from "../types";
import { centavos } from "./validatePolicyRules";

export type QuickAuthorityResult = {
  mode: "REFERENCE_SIMULATION";
  categoryId: string;
  amountCentavos: string;
  requiredTier: AuthorityTier;
  source: "PROPOSED_MEMO_REFERENCE";
  applicableCeilingCentavos?: string;
  explanation: string;
  budgetVerified: false;
  documentsVerified: false;
  delegationVerified: false;
  operationalApproval: false;
};
export type QuickAuthorityOutcome = { ok: true; result: QuickAuthorityResult } | { ok: false; error: string };

function formatPhp(cents: bigint) {
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `₱${whole}.${String(cents % 100n).padStart(2, "0")}`;
}

/** Pure proposed-reference calculation. No API calls, writes, persisted-policy dependency, or side effects. */
export function quickAuthorityCalculation(categoryId: string, amount: string): QuickAuthorityOutcome {
  const category = PROPOSED_RULES.find(rule => rule.code === categoryId);
  if (!category) return { ok: false, error: "Choose an expense category to calculate its proposed authority tier." };
  let amountCents: bigint;
  try { amountCents = centavos(amount); }
  catch { return { ok: false, error: "Enter a positive PHP amount with no more than two decimal places." }; }

  const gm = centavos(category.generalManager);
  const cfo = centavos(category.cfo);
  let requiredTier: AuthorityTier;
  let applicableCeiling: bigint | undefined;
  let lowerDescription: string;
  if (category.departmentHead !== null && amountCents <= centavos(category.departmentHead)) {
    requiredTier = "DEPARTMENT_HEAD"; applicableCeiling = centavos(category.departmentHead); lowerDescription = "within the Department Head ceiling";
  } else if (amountCents <= gm) {
    requiredTier = "GM"; applicableCeiling = gm;
    lowerDescription = category.departmentHead === null ? "CapEx has no Department Head authority" : `exceeds the Department Head ceiling of ${formatPhp(centavos(category.departmentHead))}`;
  } else if (amountCents <= cfo) {
    requiredTier = "CFO"; applicableCeiling = cfo;
    lowerDescription = `exceeds the GM ceiling of ${formatPhp(gm)} and is within the CFO ceiling of ${formatPhp(cfo)}`;
  } else {
    requiredTier = "CEO_OWNER";
    lowerDescription = `exceeds the CFO ceiling of ${formatPhp(cfo)}`;
  }
  const threshold = requiredTier === "DEPARTMENT_HEAD" ? `Department Head ceiling: ${formatPhp(centavos(category.departmentHead!))}`
    : requiredTier === "GM" ? `GM ceiling: ${formatPhp(gm)}`
    : requiredTier === "CFO" ? `CFO ceiling: ${formatPhp(cfo)}`
    : `CEO / Owner authority applies above ${formatPhp(cfo)}; no upper ceiling is defined`;
  return { ok: true, result: {
    mode: "REFERENCE_SIMULATION", categoryId, amountCentavos: amountCents.toString(), requiredTier,
    source: "PROPOSED_MEMO_REFERENCE", ...(applicableCeiling === undefined ? {} : { applicableCeilingCentavos: applicableCeiling.toString() }),
    explanation: `${formatPhp(amountCents)} ${lowerDescription}. ${threshold}.`,
    budgetVerified: false, documentsVerified: false, delegationVerified: false, operationalApproval: false,
  } };
}
