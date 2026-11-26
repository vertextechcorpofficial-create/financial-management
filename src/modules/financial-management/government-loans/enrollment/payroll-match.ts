import { normalizedReference } from "./rules";
import type { EnrollmentTerms } from "./types";

export type PayrollReference = {
  loan_id: number;
  user_id: number;
  benefit_code: string;
  reference_no: string | null;
  loan_name: string | null;
  status: string | null;
  principal_amount: string | null;
  amortization_amount: string | null;
  terms_installments: string | null;
  paid_installments: string | null;
};

export function sameProgram(first: string | null, second: string) {
  return Boolean(first?.trim() && first.trim().toLowerCase() === second.trim().toLowerCase());
}

function canonicalNumber(value: string) {
  return value.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function matchPayrollEnrollment(candidates: PayrollReference[], form: EnrollmentTerms & {
  employeeId: number; program: string;
}, benefitCode: string | undefined, allowLink: boolean) {
  const matches = candidates.filter(row => row.reference_no &&
    normalizedReference(row.reference_no) === normalizedReference(form.agencyReference));
  if (!matches.length) return { loanId: null, conflict: null, warnings: [] };
  if (matches.length > 1) return { loanId: null, conflict: "More than one live Payroll loan uses this reference.", warnings: [] };
  const [match] = matches;
  if (!allowLink || !benefitCode || match.status !== "ACTIVE" || match.user_id !== form.employeeId ||
      match.benefit_code !== benefitCode || !sameProgram(match.loan_name, form.program)) {
    return { loanId: null, conflict: "The reference belongs to another live Payroll loan or its mapping could not be verified.", warnings: [] };
  }
  const checks = [
    ["Principal", form.originalPrincipal, match.principal_amount],
    ["Monthly amortization", form.monthlyAmortization, match.amortization_amount],
    ["Installment count", String(form.installmentCount), match.terms_installments],
    ["Installments paid", String(form.installmentsPaid), match.paid_installments],
  ] as const;
  const warnings = checks.flatMap(([label, stated, recorded]) =>
    recorded === null || canonicalNumber(stated) !== canonicalNumber(recorded)
      ? [label + " differs. Agency terms " + stated + " · Payroll " + (recorded ?? "unavailable") + "."]
      : [],
  );
  return { loanId: match.loan_id, conflict: null, warnings };
}
