import type { Product } from "../policies/policy-types";
import { amountToCents, centsToAmount, lastDayOfMonth, type LoanFrequency, type LoanInstallment } from "./loan-schedule";

export type LoanAssessmentCheck = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  severity?: "warning";
};

export function passesLoanChecks(checks: readonly LoanAssessmentCheck[]) {
  return checks.every(check => check.ok || check.severity === "warning");
}

export type SalaryLoanRoom =
  | { state: "ready"; amount: string }
  | { state: "unlimited" }
  | { state: "unavailable"; message: string };

export function loanProductRoom(
  product: Pick<Product, "isOpen" | "limitType" | "savingsMultiple" | "fixedCeiling"> | null,
  savings: string, committedPrincipal: bigint,
): SalaryLoanRoom {
  if (!product?.isOpen) return { state: "unavailable", message: "The loan product is unavailable." };
  if (product.limitType === "NONE") return { state: "unlimited" };
  let limit = amountToCents(product.fixedCeiling);
  if (product.limitType === "SAVINGS_MULTIPLE") {
    const [whole, fraction = ""] = product.savingsMultiple!.split(".");
    const rate = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
    limit = (amountToCents(savings) * rate + 5_000n) / 10_000n;
  }
  const room = limit - committedPrincipal;
  const available = room > 0n ? room : 0n;
  return { state: "ready", amount: `${available / 100n}.${String(available % 100n).padStart(2, "0")}` };
}

export function salaryLoanRoom(product: Product | null, savings: string, committedPrincipal: bigint): SalaryLoanRoom {
  if (!product?.isOpen) return { state: "unavailable", message: "The salary loan product is unavailable." };
  return loanProductRoom(product, savings, committedPrincipal);
}

export function payrollTermCommitment(
  frequency: LoanFrequency,
  cutoff: string,
  installments: readonly LoanInstallment[],
  signedInstallment: string | null,
): bigint | null {
  const [year, month, day] = cutoff.split("-").map(Number);
  if (frequency === "MONTHLY" && day !== lastDayOfMonth(year, month)) return 0n;
  if (!installments.length) return signedInstallment === null ? null : amountToCents(signedInstallment);
  const next = installments.find(row => row.status !== "PAID" && row.dueDate <= cutoff);
  return next ? amountToCents(next.total) - amountToCents(next.paidTotal) : 0n;
}

type DeductionSource = "cooperative_memberships" | "cooperative_loans";
export type PayrollCommitment = { table: DeductionSource; id: number; cents: bigint };

type PostedCooperativeDeductions = {
  coop_savings: unknown;
  coop_loan: unknown;
  loan_coop?: unknown;
  breakdown_json: unknown;
};

export type PostedPayrollItem = {
  table: DeductionSource | "coop_savings_membership" | "employee_loan";
  id: number;
  key: string;
  cents: bigint;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function deductionAmount(value: unknown) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value ?? ""))) return null;
  return amountToCents(String(value));
}

// Dedicated Cooperative rows and Payroll-owned deductions can coexist in a posted result.
export function readPostedCooperativeItems(posted: PostedCooperativeDeductions) {
  let snapshot = posted.breakdown_json;
  if (typeof snapshot === "string") {
    try { snapshot = JSON.parse(snapshot) as unknown; }
    catch { return null; }
  }
  const deductions = asRecord(asRecord(snapshot)?.deductions);
  const savings = parsePayrollItems(deductions?.coop_savings_items, "cooperative_memberships", "coop_savings_membership");
  const loans = parsePayrollItems(deductions?.coop_loan_items, "cooperative_loans", "employee_loan");
  const employeeLoans = deductions?.employee_loan_items;
  if (employeeLoans !== undefined && !Array.isArray(employeeLoans)) return null;
  const payrollLoans = parsePayrollItems(
    employeeLoans?.filter(item => {
      const row = asRecord(item);
      return String(row?.code ?? row?.loan_type ?? "").trim().toUpperCase() === "COOP";
    }),
    "employee_loan",
    "employee_loan",
  );
  if (!savings || !loans || !payrollLoans) return null;
  const total = (items: PostedPayrollItem[]) => items.reduce((sum, item) => sum + item.cents, 0n);
  if (total(savings) !== deductionAmount(posted.coop_savings)) return null;

  const dedicated = deductionAmount(posted.coop_loan);
  const payroll = posted.loan_coop == null ? undefined : deductionAmount(posted.loan_coop);
  if (dedicated === null && posted.coop_loan != null || payroll === null) return null;
  const loanTotal = total(loans);
  const payrollTotal = total(payrollLoans);
  const exact = loanTotal === (dedicated ?? 0n) && payrollTotal === (payroll ?? 0n);
  const mirrored = (loanTotal === 0n || payrollTotal === 0n) &&
    (dedicated ?? payroll) === loanTotal + payrollTotal && (payroll ?? dedicated) === loanTotal + payrollTotal;
  if (!exact && !mirrored) return null;

  const results = [...savings, ...loans, ...payrollLoans];
  const keys = new Set<string>();
  const dedicatedPayrollLoans = new Set(loans.filter(item => item.table === "employee_loan").map(item => item.id));
  if (payrollLoans.some(item => dedicatedPayrollLoans.has(item.id))) return null;
  return results.every(item => {
    const key = item.key.normalize("NFKC").trim().toUpperCase();
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  }) ? results : null;
}

function parsePayrollItems(raw: unknown, first: PostedPayrollItem["table"], second: PostedPayrollItem["table"]) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const items: PostedPayrollItem[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    const source = row?.source_table;
    const table = source === first ? first : source === second ? second : null;
    const id = Number(row?.source_id);
    const cents = deductionAmount(row?.amount);
    const key = row?.item_key;
    if (!table || !Number.isSafeInteger(id) || id < 1 ||
      cents === null || typeof key !== "string" || !key.trim()) return null;
    items.push({ table, id, cents, key });
  }
  return items;
}

export function postedCooperativeItems(posted: PostedCooperativeDeductions) {
  return readPostedCooperativeItems(posted)?.filter(
    (item): item is PayrollCommitment & { key: string } =>
      item.table === "cooperative_memberships" || item.table === "cooperative_loans",
  ) ?? null;
}

export function payrollOverlap(posted: PostedCooperativeDeductions, commitments: readonly PayrollCommitment[]) {
  return payrollItemOverlap(postedCooperativeItems(posted), commitments);
}

export function payrollItemOverlap(items: ReturnType<typeof postedCooperativeItems>, commitments: readonly PayrollCommitment[]) {
  if (items === null) return null;
  const byCommitment = new Map<string, bigint>();
  for (const item of items) {
    const key = item.table + ":" + item.id;
    byCommitment.set(key, (byCommitment.get(key) ?? 0n) + item.cents);
  }
  return commitments.reduce((overlap, commitment) => {
    const deducted = byCommitment.get(commitment.table + ":" + commitment.id) ?? 0n;
    return overlap + (deducted < commitment.cents ? deducted : commitment.cents);
  }, 0n);
}

export function payrollHeadroom(netPay: string, floor: bigint, commitments: readonly PayrollCommitment[], overlap: bigint) {
  const deduction = commitments.reduce((sum, item) => sum + item.cents, 0n);
  return {
    payrollDeduction: centsToAmount(deduction),
    includedInNetPay: centsToAmount(overlap),
    headroom: centsToAmount(amountToCents(netPay) + overlap - floor - deduction),
  };
}
