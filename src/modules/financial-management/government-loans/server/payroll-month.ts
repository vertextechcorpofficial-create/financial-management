import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { expectedRegularDeduction, monthAfter, summarizeWithholding, type PayrollMonthView, type PayrollReceiptPreview } from "../loans/monthly-payroll";
import type { AgencyActor } from "./agencies";
import { centavos } from "../payroll-handoff/contract";
import { amountFromCentavos } from "../loans/position";
import { GOVERNMENT_LOAN_PAYROLL_RECEIPTS, GovernmentLoansDirectusError, writeGovernmentLoansItem } from "./directus";
import { readOpenMonth } from "./loan-enrollment";
import { readMonthlyLoanSchedules } from "./loan-register";
import { readPayrollEvidence, reconcilePayrollEvidence } from "./payroll-month-source";
import {
  hasLaterReceipt, payrollMonth, readMonthReceipts, readPayrollContract, readReceiptByCommand, readRemittablePayrollMonth, receiptSummary,
} from "./payroll-month-store";
import { LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";
import { nextPeriodCommand } from "./period-commands";

const queryInput = z.object({
  month: payrollMonth.optional(), agency: positiveId.optional(), q: z.string().trim().max(120).default(""),
  page: pageNumber, format: z.literal("csv").optional(),
});
const confirmInput = z.object({ month: payrollMonth, token: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().max(500).default("") });
const pageSize = 25;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function requireOpenMonth() {
  const openMonth = await readOpenMonth();
  if (!openMonth) throw new LoanRequestError(503, "Set the Government Loans open month before viewing Payroll results.");
  return openMonth;
}

function csvText(value: string) {
  const safe = /^[\s\uFEFF]*[=+@\-＝＋－＠]|^[\t\r\n]/u.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export async function viewPayrollMonth(params: URLSearchParams): Promise<PayrollMonthView | Response> {
  const query = parseInput(queryInput, Object.fromEntries(params));
  const openMonth = await requireOpenMonth();
  const month = query.month ?? openMonth;
  if (month > monthAfter(openMonth, 1)) throw new LoanRequestError(422, "Choose the open month, next month, or an earlier month.");
  const [loans, receipts, contract] = await Promise.all([
    readMonthlyLoanSchedules(month), readMonthReceipts(month), month === openMonth ? readPayrollContract(month) : null,
  ]);
  const current = receipts[0] ?? null;
  const search = query.q.toLowerCase();
  const agencies = new Map<number, string>();
  const rows = loans.flatMap(loan => {
    const results = loan.history.filter(result => result.month === month);
    if (!results.length && loan.schedule.firstDeductionMonth > month) return [];
    agencies.set(loan.row.agency_id, loan.agency);
    if ((query.agency && loan.row.agency_id !== query.agency) ||
      (search && ![loan.employee, loan.reference, loan.row.enrollment.agencyReference].some(value => value.toLowerCase().includes(search)))) return [];
    const expected = expectedRegularDeduction(loan.schedule, loan.history, month);
    return [{
      loanId: loan.row.id, reference: loan.reference, employee: loan.employee, agency: loan.agency, agencyId: loan.row.agency_id,
      expected, results, provisional: !current && loan.schedule.firstDeductionMonth < month &&
        (!loan.coveredThrough || loan.coveredThrough < monthAfter(month, -1)),
    }];
  });
  if (query.format === "csv") {
    const lines = ["Month,Loan,Employee,Agency,Expected deduction,Projection"];
    for (const row of rows) lines.push([month, row.reference, row.employee, row.agency, row.expected, row.provisional ? "Provisional" : "Expected"].map(csvText).join(","));
    return new Response(lines.join("\r\n") + "\r\n", { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="payroll-deductions-' + month + '.csv"',
      "X-Content-Type-Options": "nosniff",
    } });
  }
  return { month, openMonth, receipt: current ? receiptSummary(current) : null, receiptHistory: receipts.map(receiptSummary),
    contractReady: !!contract && !contract.settled, total: rows.length, hasMore: rows.length > query.page * pageSize,
    agencies: [...agencies].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    remittable: await readRemittablePayrollMonth(month, current),
    rows: rows.slice((query.page - 1) * pageSize, query.page * pageSize) };
}

async function prepareReceipt(month: string) {
  if (month !== await requireOpenMonth()) throw new LoanRequestError(409, "Only the open month can receive or correct Payroll results.");
  const periodCommand = await nextPeriodCommand(month);
  const [contract, receipts, laterReceipt] = await Promise.all([readPayrollContract(month), readMonthReceipts(month), hasLaterReceipt(month)]);
  const latest = receipts[0] ?? null;
  if (!contract) throw new LoanRequestError(409, "Approved Payroll coverage and source mappings are required for this month.");
  const [loans, evidence] = await Promise.all([readMonthlyLoanSchedules(month), readPayrollEvidence(contract)]);
  const { issues, results } = reconcilePayrollEvidence(contract, loans, evidence);
  if (contract.settled || laterReceipt) issues.push("Payroll corrections require review because confirmed activity depends on this month.");
  const scope = contract.cutoffs.map(cutoff => ({
    cutoff: cutoff.cutoff, runIds: [...cutoff.runIds].sort((a, b) => a - b),
    supersededRunIds: [...cutoff.supersededRunIds].sort((a, b) => a - b),
  })).sort((a, b) => a.cutoff.localeCompare(b.cutoff));
  const sourceHash = digest([scope, results.map(row => ({ ...row, evidence: row.evidence.map(({ itemId, ...entry }) => {
    void itemId;
    return entry;
  }) }))]);
  const token = digest([month, periodCommand.sequence, latest?.id ?? null, sourceHash, contract.approvalReference, issues]);
  const preview: PayrollReceiptPreview = { token, receipt: latest ? receiptSummary(latest) : null,
    replay: latest?.source_hash === sourceHash, runIds: scope.flatMap(cutoff => cutoff.runIds), count: results.length,
    issues, totals: summarizeWithholding(results) };
  return { preview, latest, sourceHash, scope, results, approvalReference: contract.approvalReference, periodCommand };
}

export async function previewPayrollReceipt(month: string | null) {
  return (await prepareReceipt(parseInput(payrollMonth, month))).preview;
}

export async function confirmPayrollReceipt(body: unknown, keyValue: string | null, actor: AgencyActor) {
  const input = parseInput(confirmInput, body);
  const key = parseInput(z.uuid(), keyValue);
  const requestHash = digest([actor.actorId, input]);
  const replay = async () => {
    const existing = await readReceiptByCommand(key);
    if (!existing) return null;
    if (existing.request_hash !== requestHash) throw new LoanRequestError(409, "This receipt key was already used.");
    return receiptSummary(existing);
  };
  const already = await replay();
  if (already) return already;

  const { latest, preview, sourceHash, scope, results, approvalReference, periodCommand } = await prepareReceipt(input.month);
  if (preview.issues.length) throw new LoanRequestError(409, "Resolve the Payroll evidence issues and preview the receipt again.");
  if (preview.replay && latest) return receiptSummary(latest);
  if (preview.token !== input.token) throw new LoanRequestError(409, "Payroll evidence changed. Review a new preview before confirming.");
  if (latest && !input.reason) throw new LoanRequestError(422, "Enter a reason for correcting the receipt.");
  const id = randomUUID();
  const revision = (latest?.revision ?? 0) + 1;
  const receivedAt = new Date().toISOString();
  const receipt = { id, revision, previousId: latest?.id ?? null, receivedAt, receivedBy: "Payroll system", reason: input.reason || null };
  try {
    await writeGovernmentLoansItem(GOVERNMENT_LOAN_PAYROLL_RECEIPTS, {
      id, month: input.month, revision, revision_key: input.month + ":" + revision, previous_id: receipt.previousId,
      source_hash: sourceHash, command_key: key, request_hash: requestHash, received_at: receivedAt,
      received_by: receipt.receivedBy, reason: receipt.reason,
      period_command_id: periodCommand,
      audit: { action: latest ? "CORRECT_PAYROLL_RECEIPT" : "RECEIVE_PAYROLL_RESULTS", actor: "Payroll system", role: "Integration",
        confirmedById: actor.actorId, confirmedBy: actor.actorName, confirmedByRole: actor.actorRole, occurredAt: receivedAt,
        month: input.month, previousId: receipt.previousId, reason: receipt.reason,
        finalPay: results.filter(row => row.status === "X").map(row => ({
          loanId: row.loanId, withheld: row.amount, agencyBalance: row.expected,
          unpaidByEmployee: amountFromCentavos(centavos(row.expected) - centavos(row.amount)),
        })) },
      coverage: { approvalReference, cutoffs: scope },
      results: { create: results.map(row => ({ month: input.month, request_id: row.loanId, agency_id: row.agencyId,
        employee_id: row.employeeId, payroll_loan_id: row.payrollLoanId, status: row.status, amount: row.amount,
        expected: row.expected, evidence: row.evidence })) },
    }, "id", undefined, 30_000);
    return receipt;
  } catch (error) {
    const committed = await replay();
    if (committed) return committed;
    if (error instanceof GovernmentLoansDirectusError && error.code === "RECORD_NOT_UNIQUE") {
      const [winner] = await readMonthReceipts(input.month);
      if (winner?.source_hash === sourceHash) return receiptSummary(winner);
      throw new LoanRequestError(409, "Another receipt was confirmed. Review a new preview before continuing.");
    }
    throw error;
  }
}
