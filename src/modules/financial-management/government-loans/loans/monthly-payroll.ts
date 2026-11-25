import { centavos } from "../payroll-handoff/contract";
import { amountFromCentavos } from "./position";
import type { ConfirmedDeduction, LoanChange } from "./types";

export type LoanSchedule = {
  firstDeductionMonth: string;
  term: number;
  alreadyPaid: number;
  amortization: string;
  catchUp: boolean;
  changes: LoanChange[];
};

export type PayrollEvidence = {
  runId: number;
  employeeResultId: number;
  cutoff: string;
  itemId: number | null;
  reference: string;
  amount: string;
};

export type MonthlyResult = ConfirmedDeduction & {
  loanId: number;
  agencyId: number;
  employeeId: number;
  payrollLoanId: number;
  evidence: PayrollEvidence[];
};

export function monthAfter(month: string, offset = 1) {
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + number - 1 + offset;
  return String(Math.floor(index / 12)).padStart(4, "0") + "-" + String(index % 12 + 1).padStart(2, "0");
}

export function deductionCatchUp(catchUp: boolean, history: ConfirmedDeduction[], month: string) {
  if (!catchUp) return 0n;
  const previous = history.find(row => row.month === monthAfter(month, -1) && (row.status === "P" || row.status === "F"));
  const shortfall = previous ? centavos(previous.expected) - centavos(previous.amount) : 0n;
  return shortfall > 0n ? shortfall : 0n;
}

export function expectedDeduction(schedule: LoanSchedule, history: ConfirmedDeduction[], month: string) {
  if (month < schedule.firstDeductionMonth) return "0.00";
  if (history.some(row => row.status === "X" && row.month < month)) return "0.00";
  const changes = schedule.changes.filter(change => !change.reversed && change.month <= month)
    .sort((a, b) => a.month.localeCompare(b.month));
  if (changes.some(change => change.kind === "SEPARATION" || change.kind === "PAID_DIRECTLY" || change.kind === "RENEWED" ||
    (change.kind === "SUSPENSION" && month <= change.throughMonth))) return "0.00";

  const amortization = changes.filter(change => change.kind === "AMORTIZATION").at(-1)?.amount ?? schedule.amortization;
  const regular = history.filter(row => row.status !== "X" && row.month >= schedule.firstDeductionMonth && row.month < month);
  const counted = schedule.alreadyPaid + regular.filter(row => row.status !== "F" || schedule.catchUp).length;
  return amountFromCentavos((counted < schedule.term ? centavos(amortization) : 0n) + deductionCatchUp(schedule.catchUp, regular, month));
}

export function summarizeWithholding(rows: MonthlyResult[]) {
  const totals = new Map<number, bigint>();
  for (const row of rows) {
    totals.set(row.agencyId, (totals.get(row.agencyId) ?? 0n) + (row.status === "F" ? 0n : centavos(row.amount)));
  }
  return [...totals].sort(([a], [b]) => a - b).map(([agencyId, total]) => ({ agencyId, amount: amountFromCentavos(total) }));
}

export type ReceiptSummary = {
  id: string;
  revision: number;
  receivedAt: string;
  receivedBy: string;
  reason: string | null;
  previousId: string | null;
};

export type PayrollMonthView = {
  month: string;
  openMonth: string;
  receipt: ReceiptSummary | null;
  receiptHistory: ReceiptSummary[];
  contractReady: boolean;
  total: number;
  hasMore: boolean;
  agencies: { id: number; name: string }[];
  remittable: ReturnType<typeof summarizeWithholding> | null;
  rows: { loanId: number; reference: string; employee: string; agency: string; agencyId: number;
    expected: string; provisional: boolean; results: MonthlyResult[] }[];
};

export type PayrollReceiptPreview = {
  token: string;
  receipt: ReceiptSummary | null;
  runIds: number[];
  issues: string[];
  replay: boolean;
  totals: ReturnType<typeof summarizeWithholding>;
  count: number;
};
