import { normalizedReference } from "../../enrollment/rules";
import { centavos } from "../../payroll-handoff/contract";
import { amountFromCentavos } from "../../loans/position";
import type { MonthlyResult } from "../../loans/monthly-payroll";
import type { BillingLine } from "./csv";

export type BillingLoan = {
  id: number; reference: string; systemReference: string; employee: string | null; verified: boolean;
  expected: string | null; catchUp: string;
};
export type BillingReason = {
  code: "UNENROLLED" | "UNVERIFIED" | "AMBIGUOUS_REFERENCE" | "FAILED" | "PARTIAL" | "CATCH_UP" | "FINAL_PAY" |
    "AMORTIZATION_DIFFERS" | "MISSING_BILLING" | "NO_DEDUCTION" | "MISSING_LOAN_REFERENCE";
  amount?: string;
};
export type BillingRow = {
  key: string; loanReference: string | null; loanId: number | null; systemReference: string | null;
  billedName: string | null; employee: string | null; billed: string; deduction: string | null; difference: string | null;
  reasons: BillingReason[]; resultStatuses: MonthlyResult["status"][];
};

const asAmount = amountFromCentavos;
const totalWithheld = (results: MonthlyResult[]) =>
  results.reduce((sum, row) => sum + (row.status === "F" ? 0n : centavos(row.amount)), 0n);
export const needsBillingReview = (row: BillingRow) => row.reasons.some(reason => reason.code !== "CATCH_UP" && reason.code !== "FINAL_PAY") ||
  row.difference !== null && row.difference !== "0.00";

function deductionReasons(results: MonthlyResult[], loan: BillingLoan | undefined, actual: boolean) {
  const reasons: BillingReason[] = [];
  for (const result of results) {
    if (result.status === "F") reasons.push({ code: "FAILED", amount: result.expected });
    if (result.status === "P") reasons.push({ code: "PARTIAL", amount: asAmount(centavos(result.expected) - centavos(result.amount)) });
    if (result.status === "X") reasons.push({ code: "FINAL_PAY", amount: result.amount });
  }
  const regular = actual ? results.find(row => row.status !== "X")?.expected : loan?.expected;
  if (regular == null) return { reasons, base: null };
  const carry = centavos(loan?.catchUp ?? "0.00");
  const expected = centavos(regular);
  const requestedCarry = carry < expected ? carry : expected;
  const base = expected - requestedCarry;
  const receivedCarry = actual ? totalWithheld(results.filter(row => row.status !== "X")) - base : requestedCarry;
  if (receivedCarry > 0n && requestedCarry > 0n) {
    reasons.push({ code: "CATCH_UP", amount: asAmount(receivedCarry < requestedCarry ? receivedCarry : requestedCarry) });
  }
  return { reasons, base };
}

export function compareAgencyBilling(lines: BillingLine[] | null, loans: BillingLoan[], results: MonthlyResult[] | null) {
  const byReference = new Map<string, BillingLoan[]>();
  const byId = new Map<number, BillingLoan>();
  for (const loan of loans) {
    byId.set(loan.id, loan);
    if (!loan.reference) continue;
    const key = normalizedReference(loan.reference);
    const values = byReference.get(key) ?? [];
    values.push(loan);
    byReference.set(key, values);
  }
  const byLoanId = new Map<number, MonthlyResult[]>();
  for (const result of results ?? []) {
    const rows = byLoanId.get(result.loanId) ?? [];
    rows.push(result);
    byLoanId.set(result.loanId, rows);
  }
  const readActual = results !== null;
  const billedReferences = new Set((lines ?? []).map(line => normalizedReference(line.reference)));
  const claimed = new Set<number>();
  let billedTotal = 0n;
  let comparedTotal = 0n;
  let unknownProjections = 0;
  const rows: BillingRow[] = [];

  for (const line of lines ?? []) {
    const matches = byReference.get(normalizedReference(line.reference)) ?? [];
    const loan = matches.length === 1 ? matches[0] : undefined;
    const related = loan ? byLoanId.get(loan.id) ?? [] : [];
    const billed = centavos(line.amount);
    const ambiguous = matches.length > 1;
    const deduction = ambiguous ? null : readActual ? totalWithheld(related) : loan?.verified
      ? loan.expected === null ? null : centavos(loan.expected) : 0n;
    const difference = deduction === null ? null : deduction - billed;
    const reasons: BillingReason[] = [];
    if (ambiguous) reasons.push({ code: "AMBIGUOUS_REFERENCE" });
    else if (!loan) reasons.push({ code: "UNENROLLED" });
    else if (!loan.verified && !related.length) reasons.push({ code: "UNVERIFIED" });
    else {
      if (loan) claimed.add(loan.id);
      const regular = deductionReasons(related, loan, readActual);
      reasons.push(...regular.reasons);
      const noDeduction = billed > 0n && (readActual ? !related.length : deduction === 0n);
      if (noDeduction) reasons.push({ code: "NO_DEDUCTION" });
      if (!noDeduction && difference !== null && difference !== 0n && regular.base !== null && regular.base !== billed) {
        reasons.push({ code: "AMORTIZATION_DIFFERS" });
      }
    }
    billedTotal += billed;
    comparedTotal += deduction ?? 0n;
    if (!readActual && deduction === null) unknownProjections++;
    rows.push({
      key: "bill:" + line.rowNumber, loanReference: line.reference, loanId: loan?.id ?? null,
      systemReference: loan?.systemReference ?? null, billedName: line.name, employee: loan?.employee ?? null,
      billed: line.amount, deduction: deduction === null ? null : asAmount(deduction),
      difference: difference === null ? null : asAmount(difference), reasons, resultStatuses: related.map(row => row.status),
    });
  }

  // Keep official withholding in the totals even when the billing reference is absent or ambiguous.
  if (lines) {
    for (const [id, loanResults] of byLoanId) {
      const deduction = totalWithheld(loanResults);
      if (claimed.has(id) || deduction === 0n && !loanResults.some(row => row.status === "X")) continue;
      const loan = byId.get(id);
      const reasons: BillingReason[] = [];
      if (!loan?.reference) reasons.push({ code: "MISSING_LOAN_REFERENCE" });
      else if ((byReference.get(normalizedReference(loan.reference))?.length ?? 0) > 1 &&
        billedReferences.has(normalizedReference(loan.reference))) reasons.push({ code: "AMBIGUOUS_REFERENCE" });
      else reasons.push({ code: "MISSING_BILLING" });
      reasons.push(...deductionReasons(loanResults, loan, true).reasons);
      rows.push({
        key: "deduction:" + id, loanReference: loan?.reference || null, loanId: id,
        systemReference: loan?.systemReference ?? null, billedName: null, employee: loan?.employee ?? null,
        billed: "0.00", deduction: asAmount(deduction), difference: asAmount(deduction),
        reasons, resultStatuses: loanResults.map(row => row.status),
      });
    }
  }
  const deduction = readActual ? totalWithheld(results) : comparedTotal;
  return {
    mode: readActual ? "actual" as const : "projected" as const,
    rows,
    totals: {
      billed: lines ? asAmount(billedTotal) : null,
      deduction: readActual || lines ? asAmount(deduction) : null,
      difference: lines && !unknownProjections ? asAmount(deduction - billedTotal) : null,
      unknownProjections,
      discrepancies: rows.filter(needsBillingReview).length,
    },
  };
}
