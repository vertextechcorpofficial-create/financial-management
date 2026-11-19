import { PROPOSED_RULES } from "../policy-seed";
import type { AuthorityRule } from "../types";
import { AuthorityError } from "./authorityErrors";

/** Integer centavos; capped to DECIMAL(15,2), with no binary floating point. */
export function centavos(value: string, allowZero = false): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/.test(value)) {
    throw new AuthorityError("INVALID_MONEY", "Use a positive PHP amount, at most 13 whole digits and two decimal places.");
  }
  const [whole, fraction = ""] = value.split(".");
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (result === 0n && !allowZero) throw new AuthorityError("INVALID_MONEY", "Amount must be greater than zero.");
  return result;
}
export function normalizeMoney(value: string): string {
  const cents = centavos(value);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
export function validatePolicyRules(rules: AuthorityRule[]): AuthorityRule[] {
  if (!Array.isArray(rules) || rules.length !== 25) throw new AuthorityError("INVALID_RULES", "Exactly 25 policy categories are required.");
  const codes = new Set<string>(), mapped = new Set<number>();
  return rules.map(rule => {
    const source = PROPOSED_RULES.find(row => row.code === rule.code);
    if (!source || codes.has(rule.code)) throw new AuthorityError("INVALID_RULES", "Unknown or duplicate category.");
    codes.add(rule.code);
    if ((rule.code === "CAPEX") !== (rule.departmentHead === null)) {
      throw new AuthorityError("INVALID_RULES", "Only CapEx omits Department Head authority.");
    }
    const gm = centavos(rule.generalManager), cfo = centavos(rule.cfo);
    if (gm >= cfo || (rule.departmentHead !== null && centavos(rule.departmentHead) >= gm)) {
      throw new AuthorityError("INVALID_RULES", "Authority ceilings must strictly increase from DH to GM to CFO.");
    }
    if (!Array.isArray(rule.coaIds) || rule.coaIds.length > 100) throw new AuthorityError("INVALID_RULES", "Invalid COA mapping.");
    for (const id of rule.coaIds) {
      if (!Number.isSafeInteger(id) || id <= 0 || mapped.has(id)) throw new AuthorityError("INVALID_RULES", "A COA must map to exactly one category per policy.");
      mapped.add(id);
    }
    return { ...source, departmentHead: rule.departmentHead === null ? null : normalizeMoney(rule.departmentHead),
      generalManager: normalizeMoney(rule.generalManager), cfo: normalizeMoney(rule.cfo), coaIds: [...rule.coaIds] };
  });
}
