import type { AgencyChoice, Capacity, FieldErrors, PayrollLoan, RequestForm, RequestStatus } from "./types";

export function canCancelRequest(status: RequestStatus) {
  return status === "REQUESTED" || status === "APPROVED";
}

export const positiveMoney = (value: string) =>
  /^\d{1,10}(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
export const positiveTerm = (value: string) => /^\d{1,5}$/.test(value) && Number(value) > 0;

export function cents(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function money(value: bigint) {
  const absolute = (value < 0n ? -value : value).toString().padStart(3, "0");
  return (value < 0n ? "-" : "") + absolute.slice(0, -2) + "." + absolute.slice(-2);
}

function roundedDivision(value: bigint, divisor: bigint) {
  return (2n * value + divisor) / (2n * divisor);
}

export function requiredFields(form: RequestForm, context: {
  employeeActive: boolean;
  agency: AgencyChoice | null;
  coMakerActive: boolean;
  renewalValid: boolean;
}): FieldErrors {
  const { employeeActive, agency, coMakerActive, renewalValid } = context;
  const errors: FieldErrors = {};
  if (!form.employeeId || !employeeActive) errors.employeeId = "Choose an active employee.";
  if (!agency) errors.agencyId = "Choose an active agency or lender.";
  if (!form.program || (agency && !agency.programs.includes(form.program))) errors.program = "Choose a program for the selected agency.";
  if (!form.applicationType) errors.applicationType = "Choose the application type.";
  if (!positiveMoney(form.amount)) errors.amount = "Enter a positive amount with up to two decimal places.";
  if (!positiveTerm(form.term)) errors.term = "Enter a positive term in whole months.";
  if (form.agencyAmortization && !positiveMoney(form.agencyAmortization)) errors.agencyAmortization = "Enter a positive amortization with up to two decimal places.";
  if (form.payout && agency && !agency.payoutOptions.includes(form.payout)) errors.payout = "Choose a payout option for the selected agency.";
  if (form.applicationType === "RENEWAL" && !renewalValid) errors.renewalLoanId = "Choose an active loan for this employee and agency.";
  if (agency?.agencyType === "BANK" && (!coMakerActive || form.coMakerId === form.employeeId)) errors.coMakerId = "Choose another active employee as co-maker.";
  if (!form.deductionConsent) errors.deductionConsent = "Confirm the authority to deduct.";
  if (!form.dataSharingConsent) errors.dataSharingConsent = "Confirm the consent to share data.";
  return errors;
}

export function requestCapacity(form: RequestForm, basicPay: string | null, loans: PayrollLoan[], loansVerified: boolean): Capacity {
  const agencyEstimate = positiveMoney(form.agencyAmortization);
  const proposal = agencyEstimate ? cents(form.agencyAmortization) :
    positiveMoney(form.amount) && positiveTerm(form.term) ? roundedDivision(cents(form.amount), BigInt(form.term)) : null;
  const existingLoans = loans.filter(loan => form.applicationType !== "RENEWAL" || form.renewalLoanId !== loan.id);
  const existing = loansVerified ? existingLoans.reduce((sum, loan) => sum + cents(loan.amortization), 0n) : null;
  const basic = basicPay && positiveMoney(basicPay) ? cents(basicPay) : null;
  const total = existing === null || proposal === null ? null : existing + proposal;
  return {
    basicPay,
    estimatedAmortization: proposal === null ? null : money(proposal),
    agencyEstimate,
    existingLoans,
    existingTotal: existing === null ? null : money(existing),
    remainingPay: total === null || basic === null ? null : money(basic - total),
    deductionPercent: total === null || basic === null ? null : money(roundedDivision(total * 10000n, basic)),
    aboveGuide: total === null || basic === null ? null : total * 100n > basic * 40n,
  };
}

export function changeRequestField<K extends keyof RequestForm>(form: RequestForm, key: K, value: RequestForm[K]): RequestForm {
  if (form[key] === value) return form;
  const next = { ...form, [key]: value };
  if (key === "agencyId") {
    next.program = "";
    next.payout = "";
    next.renewalLoanId = null;
    next.coMakerId = null;
    next.coMakerRelationship = "";
    next.agencyReference = "";
    next.agencyFiledOn = "";
    next.agencyAmortization = "";
    next.dataSharingConsent = false;
  }
  if (key === "employeeId") {
    next.renewalLoanId = null;
    next.coMakerId = null;
    next.coMakerRelationship = "";
    next.deductionConsent = false;
    next.dataSharingConsent = false;
  }
  if (key === "applicationType") next.renewalLoanId = null;
  if (key === "coMakerId") next.coMakerRelationship = "";
  return next;
}
