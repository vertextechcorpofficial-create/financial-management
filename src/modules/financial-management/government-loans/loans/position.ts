import { centavos } from "../payroll-handoff/contract";
import type { AgencyStatement, ConfirmedDeduction, LoanChange, LoanPosition, RegisterStatus } from "./types";

type PositionInput = {
  openMonth: string;
  businessDate: string;
  firstDeductionMonth: string;
  term: number;
  alreadyPaid: number;
  amortization: string;
  catchUp: boolean;
  changes: LoanChange[];
  // Payroll supplies one regular result per loan and month, plus any final-pay result.
  deductions: ConfirmedDeduction[];
  coveredThrough: string | null;
  statement: AgencyStatement | null;
};

type Stop = Extract<LoanChange, { kind: "RENEWED" | "SEPARATION" | "PAID_DIRECTLY" }>;

function statusFor(stop: Stop | undefined, completed: boolean, suspended: boolean): RegisterStatus {
  if (stop?.kind === "SEPARATION") return stop.finalPayReceived ? "SEPARATED" : "FINAL_PAY_REQUESTED";
  if (stop) return stop.kind;
  if (completed) return "COMPLETED";
  return suspended ? "SUSPENDED" : "ACTIVE";
}

export function amountFromCentavos(amount: bigint) {
  const sign = amount < 0n ? "-" : "";
  const digits = (amount < 0n ? -amount : amount).toString().padStart(3, "0");
  return sign + digits.slice(0, -2) + "." + digits.slice(-2);
}

function compareStatement(statement: AgencyStatement | null, deductions: ConfirmedDeduction[],
  estimate: string | null, awaitingPayroll: boolean, businessDate: string): LoanPosition["agencyBalance"] {
  if (!statement) return { latest: null, adjusted: null, difference: null, age: null, stale: false, flagged: false };

  const later = deductions.filter(row => row.status !== "F" && row.month > statement.date.slice(0, 7))
    .reduce((total, row) => total + centavos(row.amount), 0n);
  const outstanding = centavos(statement.balance) - later;
  const adjusted = outstanding > 0n ? outstanding : 0n;
  const difference = estimate === null || awaitingPayroll ? null : centavos(estimate) - adjusted;
  const magnitude = difference === null ? 0n : difference < 0n ? -difference : difference;
  const age = (Date.parse(businessDate) - Date.parse(statement.date)) / 86_400_000;

  return {
    latest: statement, adjusted: amountFromCentavos(adjusted),
    difference: difference === null ? null : amountFromCentavos(difference),
    age, stale: age > 90, flagged: magnitude > 10_000n && magnitude * 100n > adjusted * 5n,
  };
}

export function projectLoanPosition(input: PositionInput): LoanPosition {
  const { openMonth, firstDeductionMonth, term, catchUp } = input;
  const changes = input.changes.filter(change => !change.reversed).sort((a, b) => a.month.localeCompare(b.month));
  const effective = changes.filter(change => change.month <= openMonth);
  const recordedStop = effective.find((change): change is Stop =>
    change.kind === "SEPARATION" || change.kind === "PAID_DIRECTLY" || change.kind === "RENEWED") ??
    changes.find((change): change is Extract<Stop, { kind: "SEPARATION" }> => change.kind === "SEPARATION" && !!change.instructionId);
  const renewal = changes.find(change => change.kind === "RENEWED");
  const changedAmortization = effective.filter(change => change.kind === "AMORTIZATION").at(-1);
  const amortization = changedAmortization?.amount ?? input.amortization;
  const deductions = input.deductions.filter(row => row.month >= firstDeductionMonth && row.month <= openMonth);
  const finalPay = deductions.find(row => row.status === "X" && (!recordedStop || row.month >= recordedStop.month));
  const stop = finalPay && (!recordedStop || recordedStop.kind === "SEPARATION")
    ? { kind: "SEPARATION" as const, month: recordedStop?.month ?? finalPay.month, finalPayReceived: true }
    : recordedStop;
  const regular = deductions.filter(row => row.status !== "X").sort((a, b) => a.month.localeCompare(b.month));
  const last = regular.at(-1);
  const counted = Math.min(term, input.alreadyPaid + regular.filter(row => row.status !== "F" || catchUp).length);
  const lastDeductionShort = last?.status === "P" || last?.status === "F";
  const carryPending = catchUp && last && lastDeductionShort && centavos(last.expected) > centavos(last.amount);
  const reachedTerm = last ? input.coveredThrough !== null && input.coveredThrough >= last.month : input.alreadyPaid >= term;
  const completed = counted >= term && reachedTerm && !carryPending;
  const awaitingPayroll = !completed && firstDeductionMonth <= openMonth && (input.coveredThrough === null || input.coveredThrough < openMonth);
  const suspended = effective.some(change => change.kind === "SUSPENSION" && openMonth <= change.throughMonth);
  const status = statusFor(stop, completed, suspended);
  const active = status === "ACTIVE" || status === "SUSPENDED" || status === "FINAL_PAY_REQUESTED";
  const estimate = active ? amountFromCentavos(BigInt(term - counted) * centavos(amortization)) : null;

  return {
    status, active, amortization, counted, term, estimate, awaitingPayroll, lastDeductionShort,
    renewal: renewal ? { month: renewal.month, replacementId: renewal.replacementId } : null,
    agencyBalance: compareStatement(input.statement, deductions, estimate, awaitingPayroll, input.businessDate),
  };
}
