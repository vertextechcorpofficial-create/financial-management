import "server-only";

import { z } from "zod";
import { exactMoney } from "../enrollment/rules";
import { monthAfter, summarizeWithholding, type MonthlyResult, type ReceiptSummary } from "../loans/monthly-payroll";
import type { LoanChange } from "../loans/types";
import {
  GOVERNMENT_LOAN_PAYROLL_RECEIPTS, GOVERNMENT_LOAN_PAYROLL_RESULTS, GOVERNMENT_LOAN_REQUEST_HISTORY,
  GOVERNMENT_LOAN_SETTINGS, type GovernmentLoansCollection,
} from "./directus";
import { readEnrollmentRows } from "./enrollment-sources";
import { isoDateTime } from "./loan-requests";
import { payrollMonthFilter } from "./payroll-month-filter";
import { positiveId } from "./request-input";

export const payrollMonth = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);
export const payrollMoney = z.union([z.string(), z.number()]).transform(String)
  .pipe(z.string().regex(/^\d{1,13}(\.\d{1,2})?$/)).transform(exactMoney);
const evidence = z.object({
  runId: positiveId, employeeResultId: positiveId, cutoff: z.iso.date(), itemId: positiveId.nullable(),
  reference: z.string().min(1), amount: payrollMoney,
});
const receiptRow = z.object({
  id: z.uuid(), month: payrollMonth, revision: positiveId, previous_id: z.uuid().nullable(),
  source_hash: z.string(), command_key: z.uuid(), request_hash: z.string(),
  received_at: z.string(), received_by: z.string(), reason: z.string().nullable(),
});
export type PayrollReceipt = z.output<typeof receiptRow>;
const resultRow = z.object({
  id: positiveId, receipt_id: z.uuid(), month: payrollMonth, request_id: positiveId, agency_id: positiveId,
  employee_id: positiveId, payroll_loan_id: positiveId, status: z.enum(["D", "P", "F", "X"]),
  amount: payrollMoney, expected: payrollMoney, evidence: z.array(evidence),
});

const limit = 50;
export async function readPayrollPages<T>(collection: GovernmentLoansCollection, schema: z.ZodType<T>, fields: string,
  filter: object, sort: string) {
  const result: T[] = [];
  for (let offset = 0; ; offset += limit) {
    const rows = await readEnrollmentRows(collection, schema, fields, filter, limit, sort, offset);
    result.push(...rows);
    if (rows.length < limit) return result;
  }
}

export function receiptSummary(row: PayrollReceipt): ReceiptSummary {
  return { id: row.id, revision: row.revision, previousId: row.previous_id,
    receivedAt: isoDateTime(row.received_at), receivedBy: row.received_by, reason: row.reason };
}

export function readMonthReceipts(month: string) {
  return readPayrollPages(GOVERNMENT_LOAN_PAYROLL_RECEIPTS, receiptRow, Object.keys(receiptRow.shape).join(","),
    { month: { _eq: month } }, "-revision,id");
}

export async function readCurrentPayrollReceipt(month: string) {
  const [receipt] = await readEnrollmentRows(GOVERNMENT_LOAN_PAYROLL_RECEIPTS, receiptRow, Object.keys(receiptRow.shape).join(","),
    { month: { _eq: month } }, 1, "-revision,id");
  return receipt ?? null;
}

export async function readReceiptByCommand(key: string) {
  const [receipt] = await readEnrollmentRows(GOVERNMENT_LOAN_PAYROLL_RECEIPTS, receiptRow, Object.keys(receiptRow.shape).join(","),
    { command_key: { _eq: key } }, 1);
  return receipt ?? null;
}

export async function readLatestReceipts(firstMonth: string, throughMonth: string) {
  const rows = await readPayrollPages(GOVERNMENT_LOAN_PAYROLL_RECEIPTS, receiptRow, Object.keys(receiptRow.shape).join(","),
    payrollMonthFilter("month", firstMonth, throughMonth), "month,-revision,id");
  const latest = new Map<string, PayrollReceipt>();
  for (const row of rows) {
    if (!latest.has(row.month)) latest.set(row.month, row);
  }
  return latest;
}

export async function hasLaterReceipt(month: string) {
  if (month === "9999-12") return false;
  const rows = await readEnrollmentRows(GOVERNMENT_LOAN_PAYROLL_RECEIPTS, z.object({ id: z.uuid() }), "id",
    payrollMonthFilter("month", monthAfter(month), "9999-12"), 1);
  return rows.length > 0;
}

export async function readPayrollResults(filter: object): Promise<(MonthlyResult & { receiptId: string })[]> {
  const rows = await readPayrollPages(GOVERNMENT_LOAN_PAYROLL_RESULTS, resultRow, Object.keys(resultRow.shape).join(","), filter, "id");
  return rows.map(payrollResult);
}

export async function readPayrollResultPage(filter: object, limit: number, offset: number) {
  return (await readEnrollmentRows(GOVERNMENT_LOAN_PAYROLL_RESULTS, resultRow, Object.keys(resultRow.shape).join(","),
    filter, limit, "id", offset)).map(payrollResult);
}

function payrollResult(row: z.output<typeof resultRow>): MonthlyResult & { receiptId: string } {
  return {
    receiptId: row.receipt_id, loanId: row.request_id, agencyId: row.agency_id, employeeId: row.employee_id,
    payrollLoanId: row.payroll_loan_id, month: row.month, status: row.status, amount: row.amount, expected: row.expected,
    evidence: row.evidence,
  };
}

export async function readLatestLoanPayroll(loanIds: number[], receipts: ReadonlyMap<string, PayrollReceipt>) {
  const result = new Map<number, Awaited<ReturnType<typeof readPayrollResults>>>();
  if (!loanIds.length || !receipts.size) return result;
  const receiptIds = [...receipts.values()].map(receipt => receipt.id);
  for (let start = 0; start < receiptIds.length; start += 25) {
    const rows = await readPayrollResults({
      request_id: { _in: loanIds }, receipt_id: { _in: receiptIds.slice(start, start + 25) },
    });
    for (const row of rows) {
      if (receipts.get(row.month)?.id !== row.receiptId) continue;
      if (!result.has(row.loanId)) result.set(row.loanId, []);
      result.get(row.loanId)!.push(row);
    }
  }
  return result;
}

export function payrollCoveredThrough(receipts: ReadonlyMap<string, PayrollReceipt>, start: string, end: string) {
  if (start > end) return null;
  let covered: string | null = null;
  for (let month = start; month <= end && receipts.has(month); month = monthAfter(month)) covered = month;
  return covered;
}

const scheduleChange = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("AMORTIZATION"), month: payrollMonth, amount: payrollMoney }),
  z.object({ kind: z.literal("SUSPENSION"), month: payrollMonth, throughMonth: payrollMonth }),
  z.object({ kind: z.literal("SEPARATION"), month: payrollMonth, balance: payrollMoney.optional() })
    .transform(change => ({ ...change, finalPayReceived: false })),
  z.object({ kind: z.literal("PAID_DIRECTLY"), month: payrollMonth }),
]);
const scheduleEvent = z.discriminatedUnion("action", [
  z.object({ action: z.literal("LOAN_TERMS_CHANGED"), request_id: positiveId, revision: positiveId,
    after_values: z.object({ loanChange: scheduleChange, instructionId: z.uuid().optional() }) }),
  z.object({ action: z.literal("LOAN_TERMS_CHANGE_REVERSED"), request_id: positiveId, revision: positiveId,
    after_values: z.object({ reversedRevision: positiveId }) }),
]);

// The changes workflow can append these events with the existing request revision writer.
export async function readApprovedScheduleChanges(loanIds: number[]) {
  const events = await readPayrollPages(GOVERNMENT_LOAN_REQUEST_HISTORY, scheduleEvent, "action,request_id,revision,after_values", {
    request_id: { _in: loanIds }, action: { _in: ["LOAN_TERMS_CHANGED", "LOAN_TERMS_CHANGE_REVERSED"] },
  }, "request_id,revision,id");
  const reversals = new Set(events.flatMap(event => event.action === "LOAN_TERMS_CHANGE_REVERSED"
    ? [event.request_id + ":" + event.after_values.reversedRevision] : []));
  const changes = new Map<number, LoanChange[]>();
  for (const event of events) {
    if (event.action !== "LOAN_TERMS_CHANGED" || reversals.has(event.request_id + ":" + event.revision)) continue;
    const loanChanges = changes.get(event.request_id) ?? [];
    const { loanChange, instructionId } = event.after_values;
    loanChanges.push(loanChange.kind === "SEPARATION" ? { ...loanChange, instructionId } : loanChange);
    changes.set(event.request_id, loanChanges);
  }
  return changes;
}

export async function readRemittablePayrollMonth(month: string, receipt?: PayrollReceipt | null) {
  const current = receipt === undefined ? (await readMonthReceipts(month))[0] : receipt;
  if (!current) return null;
  return summarizeWithholding(await readPayrollResults({ receipt_id: { _eq: current.id } }));
}

const payrollCoverage = z.object({
  cutoff: z.iso.date(), runIds: z.array(positiveId).min(1).max(100),
  supersededRunIds: z.array(positiveId).max(100).default([]),
});
const outcome = z.discriminatedUnion("status", [
  z.object({ status: z.literal("F"), runId: positiveId, payrollLoanId: positiveId, reference: z.string().trim().min(1).max(200) }),
  z.object({ status: z.literal("X"), runId: positiveId, payrollLoanId: positiveId, reference: z.string().trim().min(1).max(200),
    balance: payrollMoney, instructionId: z.uuid().optional(), zeroConfirmed: z.boolean().default(false) }),
]);
const coverageControl = z.object({ runId: positiveId, employeeId: positiveId, actual: payrollMoney });
const payrollContract = z.object({
  month: payrollMonth,
  approvalReference: z.string().trim().min(1).max(200),
  cutoffs: z.array(payrollCoverage).min(1).max(8),
  outcomes: z.array(outcome).default([]),
  employeeControls: z.array(coverageControl),
  refundPayouts: z.array(z.object({ instructionId: z.uuid(), reference: z.string().trim().min(1).max(200),
    paidOn: z.iso.date(), amount: payrollMoney })).default([]),
  settled: z.boolean().default(false),
});
export type PayrollContract = z.output<typeof payrollContract>;

export async function readPayrollContract(month: string) {
  const [row] = await readEnrollmentRows(GOVERNMENT_LOAN_SETTINGS, z.object({ payroll_receipt_contract: z.unknown() }),
    "payroll_receipt_contract", { id: { _eq: 1 } }, 1);
  const contract = payrollContract.safeParse(row?.payroll_receipt_contract);
  return contract.success && contract.data.month === month ? contract.data : null;
}
