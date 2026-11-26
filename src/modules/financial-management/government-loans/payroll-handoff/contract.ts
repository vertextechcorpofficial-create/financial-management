import { z } from "zod";
import type { HandoffStatus, PayrollAcknowledgement, PayrollHandoffPayload } from "./types";

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const amount = z.string().regex(/^\d{1,13}(\.\d{1,2})?$/);
const cutoffIds = z.array(id).min(1).max(2);
export const payrollHandoffPayload = z.object({
  handoffId: z.uuid(),
  enrollmentId: id, employeeId: id, agencyId: id, benefitCode: z.string().min(1), program: z.string().min(1),
  start: z.object({
    id: z.uuid(), agencyReference: z.string().min(1), effectiveMonth: month, monthlyAmount: amount,
    remainingInstallments: id, payrollLoanId: id.nullable(), cutoffIds: cutoffIds.optional(),
  }),
  stop: z.object({ id: z.uuid(), effectiveMonth: month, cutoffId: id.optional(), payrollLoanId: id, enrollmentId: id.nullable() }).nullable(),
});
const receiptFields = {
  instructionId: z.uuid(),
  receiptId: z.string().trim().min(1).max(120),
  acknowledgedAt: z.iso.datetime({ offset: true }),
  effectiveMonth: month,
  cutoffId: id.optional(),
};
export const payrollAcknowledgement = z.object({
  ...receiptFields,
  payrollLoanId: id,
  monthlyAmount: amount.optional(),
  remainingInstallments: id.optional(),
  sourceRevision: id.optional(),
  schedule: z.object({ remainingInstallments: id, deductions: z.array(z.object({ cutoffId: id, amount })).min(1).max(2) }).optional(),
});
export const payrollReceiptRow = z.discriminatedUnion("result", [
  payrollAcknowledgement.omit({ sourceRevision: true, schedule: true }).extend({
    handoffId: z.uuid(), result: z.literal("ACCEPTED"), reason: z.string().max(400),
  }),
  z.object({
    ...receiptFields, handoffId: z.uuid(), result: z.enum(["REJECTED", "NOT_APPLIED"]),
    payrollLoanId: id.optional(), reason: z.string().trim().min(1).max(400),
  }),
]);
export type PayrollReceiptRow = z.output<typeof payrollReceiptRow>;

export function centavos(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function receiptAmount(ack: PayrollAcknowledgement) {
  if (ack.schedule) return ack.schedule.deductions.reduce((sum, row) => sum + centavos(row.amount), 0n);
  return ack.monthlyAmount === undefined ? null : centavos(ack.monthlyAmount);
}

function matchesStart({ start, stop }: PayrollHandoffPayload, ack: PayrollAcknowledgement) {
  return ack.effectiveMonth === start.effectiveMonth &&
    (start.payrollLoanId === null || ack.payrollLoanId === start.payrollLoanId) && ack.payrollLoanId !== stop?.payrollLoanId &&
    (!start.cutoffIds || (ack.cutoffId !== undefined && start.cutoffIds.includes(ack.cutoffId))) &&
    (ack.schedule?.remainingInstallments ?? ack.remainingInstallments) === start.remainingInstallments &&
    receiptAmount(ack) === centavos(start.monthlyAmount);
}

function matchesStop(stop: PayrollHandoffPayload["stop"], ack: PayrollAcknowledgement) {
  return stop && ack.payrollLoanId === stop.payrollLoanId && ack.effectiveMonth === stop.effectiveMonth &&
    (stop.cutoffId === undefined || ack.cutoffId === stop.cutoffId);
}

function sameReceipt(first: PayrollAcknowledgement, next: PayrollAcknowledgement) {
  return first.receiptId === next.receiptId && first.payrollLoanId === next.payrollLoanId &&
    first.effectiveMonth === next.effectiveMonth && first.cutoffId === next.cutoffId &&
    Date.parse(first.acknowledgedAt) === Date.parse(next.acknowledgedAt) && receiptAmount(first) === receiptAmount(next) &&
    (first.schedule?.remainingInstallments ?? first.remainingInstallments) === next.remainingInstallments;
}

type FileReview = { state: HandoffStatus; reason: string | null; acknowledgements: PayrollAcknowledgement[]; repeated: boolean };

export function reviewPayrollReceipts(payload: PayrollHandoffPayload, rows: PayrollReceiptRow[], recorded: PayrollAcknowledgement[],
  sourceProblems?: ReadonlyMap<string, string>): FileReview {
  const acknowledgements = new Map(recorded.map(ack => [ack.instructionId, ack]));
  const issues: string[] = [];
  let repeated = true;
  for (const row of rows) {
    const start = row.instructionId === payload.start.id;
    const label = start ? "Start deduction" : "Stop prior deduction";
    const previous = acknowledgements.get(row.instructionId);
    if (row.effectiveMonth !== payload.start.effectiveMonth) {
      issues.push(`${label}: the effective month differs from the instruction.`);
    } else if (row.result !== "ACCEPTED") {
      issues.push(`${label}: ${previous ? "Payroll already acknowledged this instruction." : row.reason}`);
    } else {
      const ack = payrollAcknowledgement.parse(row);
      const sourceProblem = sourceProblems?.get(row.instructionId);
      const matches = start ? matchesStart(payload, ack) : matchesStop(payload.stop, ack);
      if (!matches || sourceProblem || (previous && !sameReceipt(previous, ack))) {
        issues.push(`${label}: ${sourceProblem ?? (previous ? "the receipt conflicts with the recorded acknowledgement." :
          "the Payroll loan, schedule, or amortization differs from the instruction.")}`);
      } else if (!previous) {
        acknowledgements.set(row.instructionId, ack);
        repeated = false;
      }
    }
  }

  const count = payload.stop ? 2 : 1;
  const confirmed = [...acknowledgements.values()];
  if (rows.length === count && rows.every(row => row.result === "NOT_APPLIED" && row.effectiveMonth === payload.start.effectiveMonth) && !confirmed.length) {
    return { state: "RETRYABLE", reason: "Payroll confirmed the instructions were not applied. Download the original CSV to retry.",
      acknowledgements: confirmed, repeated: false };
  }
  if (!issues.length && confirmed.length === count) return { state: "ACCEPTED", reason: null, acknowledgements: confirmed, repeated };
  const missing = acknowledgements.has(payload.start.id) ? "Stop prior deduction" : "Start deduction";
  return { state: "NEEDS_REVIEW", reason: issues.join(" ") || `${missing} is awaiting Payroll acknowledgement.`,
    acknowledgements: confirmed, repeated: repeated && !issues.length };
}
