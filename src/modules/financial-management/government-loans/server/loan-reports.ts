import "server-only";

import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { expectedDeduction, monthAfter } from "../loans/monthly-payroll";
import { amountFromCentavos, projectLoanPosition } from "../loans/position";
import { centavos } from "../payroll-handoff/contract";
import { remitKey, remittanceDeadline, remittanceStatus } from "../remittances/preparation/rules";
import { GOVERNMENT_LOAN_AGENCIES, GOVERNMENT_LOAN_PAYROLL_RESULTS, GOVERNMENT_LOAN_REQUESTS, readGovernmentLoansItems } from "./directus";
import { readGroups } from "./enrollment-sources";
import { readChangeInstructions, readLoanChangeHistory, readOpenLoanMonth } from "./loan-changes";
import { agencyStatement, readLoanSchedule, readMonthlyLoanSchedules } from "./loan-register";
import { isoDateTime } from "./loan-requests";
import { payrollMonth, payrollMoney, readLatestReceipts, readPayrollPages, readPayrollResults } from "./payroll-month-store";
import { latestRemittances, readRemittanceApprovalIds, readReportRemittances } from "./remittance-records";
import { employeeName } from "./request-assessment";
import { flag, LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";

const employeeChoice = z.object({ user_id: positiveId, user_fname: z.string().nullable(), user_mname: z.string().nullable(),
  user_lname: z.string().nullable() });
const employeePageSize = 12;
export async function reportEmployees(params: URLSearchParams) {
  const { q, page } = parseInput(z.object({ q: z.string().trim().max(120).default(""), page: pageNumber }), Object.fromEntries(params));
  const filter = { status: { _eq: "ACTIVE" }, enrollment: { _nnull: true }, employee_user_id: { _nnull: true },
    ...(q ? { _or: [{ employee_name: { _icontains: q } }, ...(/^[1-9]\d{0,9}$/.test(q) ? [{ employee_user_id: { _eq: Number(q) } }] : [])] } : {}) };
  const query = new URLSearchParams({ filter: JSON.stringify(filter), "groupBy[]": "employee_user_id",
    "aggregate[count]": "id", sort: "employee_user_id", limit: String(employeePageSize + 1), offset: String((page - 1) * employeePageSize) });
  const { data } = z.object({ data: z.array(z.object({ employee_user_id: positiveId })).max(employeePageSize + 1) })
    .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUESTS, query));
  const ids = data.slice(0, employeePageSize).map(row => row.employee_user_id);
  const employees = await readGroups<z.output<typeof employeeChoice>, number>("user", employeeChoice, ids,
    values => ({ user_id: { _in: values } }), "user_id");
  const names = new Map(employees.map(row => [row.user_id, employeeName(row)]));
  return { items: ids.map(id => ({ id, name: names.get(id) ?? "Employee " + id })), page, hasMore: data.length > employeePageSize };
}

type Loan = Awaited<ReturnType<typeof readLoanSchedule>>;
function ledgerLoan({ row, schedule, history, reference, employee, agency, coveredThrough }: Loan, openMonth: string) {
  return { id: row.id, reference, employee, agency, program: row.form.program, agencyReference: row.enrollment.agencyReference,
    alreadyPaid: schedule.alreadyPaid, ...projectLoanPosition({
      ...schedule, openMonth, businessDate: todayManila(), coveredThrough, deductions: history,
      statement: row.agency_statements[0] ? agencyStatement(row.agency_statements[0]) : null,
    }) };
}

const payout = z.object({ date: z.iso.date(), reference: z.string() });
export async function reportEmployeeLedger(params: URLSearchParams) {
  const { employeeId } = parseInput(z.object({ employeeId: positiveId }), Object.fromEntries(params));
  const month = await readOpenLoanMonth();
  return { month, loans: (await readMonthlyLoanSchedules(month, employeeId)).map(row => ledgerLoan(row, month)) };
}

export async function reportLedgerLoan(params: URLSearchParams) {
  const { employeeId, loanId } = parseInput(z.object({ employeeId: positiveId, loanId: positiveId }), Object.fromEntries(params));
  const open = await readOpenLoanMonth();
  const selected = await readLoanSchedule(loanId, open, employeeId);
  const { schedule, history, receipts, row } = selected;
  const [events, instructions, attempts] = await Promise.all([
    readLoanChangeHistory(loanId),
    readChangeInstructions({ request_id: { _eq: loanId }, action: { _eq: "REFUND" } }),
    readReportRemittances({ agency_id: { _eq: row.agency_id }, payroll_month: { _gte: schedule.firstDeductionMonth, _lte: open },
      state: { _in: ["APPROVED", "PENDING"] } }),
  ]);
  const attemptsByMonth = latestRemittances(attempts);
  const approvals = await readRemittanceApprovalIds(attempts.filter(item => item.state === "APPROVED").map(item => item.id));
  const byMonth = new Map(history.map(result => [result.month, result]));
  const currentEvidence = new Map(history.map(result => [result.receiptId, result]));
  const oldReceiptIds = [...new Set([...attemptsByMonth.values()].map(item => item.source_snapshot.receiptId))]
    .filter(id => !currentEvidence.has(id));
  for (let start = 0; start < oldReceiptIds.length; start += 25) {
    const older = await readPayrollResults({ receipt_id: { _in: oldReceiptIds.slice(start, start + 25) },
      request_id: { _eq: loanId }, agency_id: { _eq: row.agency_id } });
    for (const result of older) currentEvidence.set(result.receiptId, result);
  }
  const deductions = [];
  for (let month = schedule.firstDeductionMonth; month <= open; month = monthAfter(month)) {
    const result = byMonth.get(month);
    const receipt = receipts.get(month);
    const attempt = attemptsByMonth.get(remitKey(row.agency_id, month));
    const covered = attempt ? currentEvidence.get(attempt.source_snapshot.receiptId) : undefined;
    const linked = covered && covered.month === month && covered.agencyId === row.agency_id &&
      covered.status !== "F" && centavos(covered.amount) > 0n ? attempt : undefined;
    const expected = result?.expected ?? expectedDeduction(schedule, history, month);
    const pendingFinalPay = schedule.changes.some(change => change.kind === "SEPARATION" && !change.finalPayReceived && change.month === month);
    if (!result && expected === "0.00" && !linked && !pendingFinalPay) continue;
    deductions.push({ month, status: result?.status ?? (receipt ? "NO_RESULT" as const : "AWAITING" as const),
      expected, actual: result?.amount ?? null, receiptId: receipt?.id ?? null, revision: receipt?.revision ?? null,
      unpaid: result?.status === "X" ? amountFromCentavos(centavos(result.expected) - centavos(result.amount)) : null,
      remittance: linked ? { id: linked.id, approvalId: approvals.get(linked.id) ?? null, state: linked.state,
        reference: linked.payment_reference, date: linked.payment_date, receiptId: linked.source_snapshot.receiptId,
        revision: linked.source_snapshot.receiptRevision, included: covered!.amount,
        olderSource: linked.source_snapshot.receiptId !== receipt?.id } : null });
  }
  const reversed = new Set(events.map(event => event.after_values.reversedRevision));
  return {
    loan: ledgerLoan(selected, open), deductions: deductions.reverse(),
    events: events.map(event => ({ revision: event.revision, action: event.action, actor: event.actor_name,
      at: isoDateTime(event.occurred_at), ...event.after_values, reversed: reversed.has(event.revision) })),
    refunds: instructions.map(instruction => ({
      id: instruction.id, state: instruction.state, month: instruction.effective_month,
      amount: payrollMoney.parse(instruction.details.amount), reference: typeof instruction.details.reference === "string" ? instruction.details.reference : "",
      payout: instruction.state === "PAID" ? payout.parse(instruction.details.payout) : null,
    })),
  };
}

const reportAgency = z.object({ id: positiveId, display_name: z.string(), short_code: z.string(), is_active: flag,
  deadline_rule: z.enum(["FIXED_DAY", "END_OF_MONTH"]), deadline_day: z.number().int().nullable(), reminder_days: z.number().int() });
const withholding = z.object({ agency_id: positiveId, receipt_id: z.uuid(), amount: payrollMoney });
const remittancePageSize = 25;

export async function reportAgencyRemittances(params: URLSearchParams) {
  const { month, page } = parseInput(z.object({ month: payrollMonth.optional(), page: pageNumber }), Object.fromEntries(params));
  const openMonth = await readOpenLoanMonth();
  if (month && month > openMonth) throw new LoanRequestError(422, "Choose the open Payroll month or an earlier month.");
  const months = month ? [month] : Array.from({ length: 14 }, (_, offset) => monthAfter(openMonth, -offset));
  const [agencies, receipts, payments] = await Promise.all([
    readPayrollPages(GOVERNMENT_LOAN_AGENCIES, reportAgency, Object.keys(reportAgency.shape).join(","), {}, "display_name,id"),
    readLatestReceipts(months.at(-1)!, months[0]),
    readReportRemittances({ payroll_month: { _in: months } }),
  ]);
  const receiptIds = [...receipts.values()].map(receipt => receipt.id);
  const amounts = receiptIds.length ? await readPayrollPages(GOVERNMENT_LOAN_PAYROLL_RESULTS, withholding,
    "agency_id,receipt_id,amount", { receipt_id: { _in: receiptIds }, status: { _in: ["D", "P", "X"] } }, "id") : [];
  const totals = new Map<string, bigint>();
  for (const result of amounts) {
    const key = remitKey(result.agency_id, result.receipt_id);
    totals.set(key, (totals.get(key) ?? 0n) + centavos(result.amount));
  }
  const byAgencyMonth = latestRemittances(payments);
  const today = todayManila();
  const items = months.flatMap(month => agencies.flatMap(agency => {
    const receipt = receipts.get(month);
    const payment = byAgencyMonth.get(remitKey(agency.id, month));
    const withheld = receipt ? amountFromCentavos(totals.get(remitKey(agency.id, receipt.id)) ?? 0n) : null;
    if (!agency.is_active && !payment && (withheld === null || withheld === "0.00")) return [];
    const due = payment?.due_date ?? remittanceDeadline(month, { deadlineRule: agency.deadline_rule, deadlineDay: agency.deadline_day });
    const { status, label } = remittanceStatus(withheld, payment?.state ?? null, today, due, agency.reminder_days, payment?.payment_date);
    const remitted = payment?.state === "APPROVED" ? payment.withheld : "0.00";
    return [{ key: remitKey(agency.id, month), agency: payment?.agency_name ?? agency.display_name, code: payment?.agency_code ?? agency.short_code,
      month, withheld, remitted, outstanding: withheld === null ? null : amountFromCentavos(centavos(withheld) - centavos(remitted)),
      status, label, due, paidOn: payment?.payment_date ?? null, daysLate: payment?.days_late ?? null,
      penalty: payment?.entered_penalty ?? null, reference: payment?.payment_reference ?? null, remittanceId: payment?.id ?? null,
      receipt: receipt ? { id: receipt.id, revision: receipt.revision } : null,
      filedReceipt: payment ? { id: payment.source_snapshot.receiptId, revision: payment.source_snapshot.receiptRevision } : null }];
  }));
  const visible = items.slice((page - 1) * remittancePageSize, page * remittancePageSize);
  const approvals = await readRemittanceApprovalIds(visible.flatMap(row => row.status === "approved" && row.remittanceId ? [row.remittanceId] : []));
  return { openMonth, page, total: items.length, hasMore: items.length > page * remittancePageSize,
    items: visible.map(row => ({ ...row, approvalId: row.remittanceId ? approvals.get(row.remittanceId) ?? null : null })) };
}
