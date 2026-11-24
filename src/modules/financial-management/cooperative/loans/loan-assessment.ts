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
  breakdown_json: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function deductionAmount(value: unknown) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value ?? ""))) return null;
  return amountToCents(String(value));
}

// Dedicated Cooperative rows and VOS employee loans can coexist in a posted pay result.
// Use the matched portions of the dedicated deductions already carried in net pay.
export function postedCooperativeItems(posted: PostedCooperativeDeductions) {
  let snapshot = posted.breakdown_json;
  if (typeof snapshot === "string") {
    try { snapshot = JSON.parse(snapshot) as unknown; }
    catch { return null; }
  }
  const deductions = asRecord(asRecord(snapshot)?.deductions);
  const totals = [
    { field: "coop_savings", table: "cooperative_memberships", otherTable: "coop_savings_membership" },
    { field: "coop_loan", table: "cooperative_loans", otherTable: "employee_loan" },
  ] as const;
  const verified: Array<PayrollCommitment & { key: string }> = [];
  const seen = new Set<string>();
  for (const { field, table, otherTable } of totals) {
    const amount = deductionAmount(posted[field]);
    if (amount === null) return null;
    const items = deductions?.[field + "_items"];
    if (amount === 0n && items === undefined) continue;
    if (!Array.isArray(items)) return null;
    let sum = 0n;
    for (const item of items) {
      const row = asRecord(item);
      const cents = deductionAmount(row?.amount);
      const sourceId = Number(row?.source_id);
      const sourceTable = row?.source_table;
      const key = row?.item_key;
      if (cents === null || typeof key !== "string" || !key || seen.has(key) ||
        (sourceTable !== table && sourceTable !== otherTable) ||
        !Number.isSafeInteger(sourceId) || sourceId < 1) return null;
      seen.add(key);
      sum += cents;
      if (sourceTable !== table) continue;
      verified.push({ table, id: sourceId, key, cents });
    }
    if (sum !== amount) return null;
  }
  return verified;
}

export function payrollOverlap(posted: PostedCooperativeDeductions, commitments: readonly PayrollCommitment[]) {
  const items = postedCooperativeItems(posted);
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
