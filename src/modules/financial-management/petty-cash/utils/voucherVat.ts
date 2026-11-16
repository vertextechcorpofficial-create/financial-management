import type { Choice } from "../onboarding-types";

export type VatEligibility = { eligible: boolean; reason: string | null };

export function vatEligibility(payee: Choice | null, documentType: string): VatEligibility {
  if (!payee) return { eligible: false, reason: "Select a payee to determine VAT eligibility." };
  if (!Boolean(payee.details.vatRegistered)) return { eligible: false, reason: "VAT is unavailable for Non-VAT payees." };
  if (!String(payee.details.tin || "").trim()) return { eligible: false, reason: "VAT requires a complete payee TIN." };
  if (documentType !== "INVOICE") return { eligible: false, reason: "Input VAT is available only for Invoice document types." };
  return { eligible: true, reason: null };
}
