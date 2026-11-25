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
import { csvReport, moneyCents, moneyTotal, pageReport, reportQuery, sortReport } from "./report-output";

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
  return { id: row.id, agencyId: row.agency_id, reference, employee, agency, program: row.form.program, agencyReference: row.enrollment.agencyReference,
    alreadyPaid: schedule.alreadyPaid, ...projectLoanPosition({
      ...schedule, openMonth, businessDate: todayManila(), coveredThrough, deductions: history,
      statement: row.agency_statements[0] ? agencyStatement(row.agency_statements[0]) : null,
    }) };
}

const payout = z.object({ date: z.iso.date(), reference: z.string() });
export async function reportEmployeeLedger(params: URLSearchParams, full = false) {
  const filters = parseInput(z.object({ employeeId: positiveId, agency: positiveId.optional(),
    status: z.enum(["active", "closed"]).optional(), ...reportQuery("ledger", "reference") }), Object.fromEntries(params));
  const month = await readOpenLoanMonth();
  const entries = (await readMonthlyLoanSchedules(month, filters.employeeId)).map(row => ({ row, loan: ledgerLoan(row, month) }));
  const agencies = [...new Map(entries.map(({ loan }) => [loan.agencyId, { id: loan.agencyId, name: loan.agency }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  const matches = entries.filter(({ loan }) => (!filters.agency || filters.agency === loan.agencyId) &&
    (!filters.status || loan.active === (filters.status === "active")));
  sortReport(matches, ({ loan }) => {
    if (filters.sort === "estimate") return loan.estimate === null ? null : moneyCents(loan.estimate);
    return filters.sort === "agency" ? loan.agency : filters.sort === "status" ? loan.status : loan.reference;
  }, ({ loan }) => String(loan.id), filters.direction);
  const loans = pageReport(matches, filters, full).map(entry => entry.loan);
  return { month, employee: entries[0]?.loan.employee ?? null, agencies, loans,
    total: matches.length, hasMore: matches.length > filters.page * filters.size,
    totalEstimated: matches.every(entry => entry.loan.estimate !== null) ? moneyTotal(matches, entry => entry.loan.estimate) : null };
}

export async function reportLedgerLoan(params: URLSearchParams) {
  const { employeeId, loanId } = parseInput(z.object({ employeeId: positiveId, loanId: positiveId }), Object.fromEntries(params));
  const open = await readOpenLoanMonth();
  const selected = await readLoanSchedule(loanId, open, employeeId);
  return ledgerDetails(selected, open);
}

async function ledgerDetails(selected: Loan, open: string) {
  const { schedule, history, receipts, row } = selected;
  const loanId = row.id;
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
export async function reportAgencyRemittances(params: URLSearchParams, full = false) {
  const filters = parseInput(z.object({ month: payrollMonth.optional(), year: z.string().regex(/^[1-9]\d{3}$/).optional(),
    agency: positiveId.optional(), status: z.enum(["awaiting_payroll", "nothing", "open", "pending", "returned", "on_time", "late"]).optional(),
    ...reportQuery("remittances", "month", "desc") }), Object.fromEntries(params));
  const { month, year, page } = filters;
  const openMonth = await readOpenLoanMonth();
  if ((month && month > openMonth) || (year && year > openMonth.slice(0, 4))) throw new LoanRequestError(422, "Choose the open Payroll period or an earlier period.");
  if (month && year && month.slice(0, 4) !== year) throw new LoanRequestError(422, "Choose a month within the selected Payroll year.");
  const yearLength = year === openMonth.slice(0, 4) ? Number(openMonth.slice(5)) : 12;
  const months = month ? [month] : year ? Array.from({ length: yearLength }, (_, offset) => monthAfter(year + "-01", yearLength - 1 - offset)) :
    Array.from({ length: 14 }, (_, offset) => monthAfter(openMonth, -offset));
  const [agencies, receipts, payments] = await Promise.all([
    readPayrollPages(GOVERNMENT_LOAN_AGENCIES, reportAgency, Object.keys(reportAgency.shape).join(","), {}, "display_name,id"),
    readLatestReceipts(months.at(-1)!, months[0]),
    readReportRemittances({ payroll_month: { _in: months }, ...(filters.agency ? { agency_id: { _eq: filters.agency } } : {}) }),
  ]);
  const receiptIds = [...receipts.values()].map(receipt => receipt.id);
  const amounts = receiptIds.length ? await readPayrollPages(GOVERNMENT_LOAN_PAYROLL_RESULTS, withholding,
    "agency_id,receipt_id,amount", { receipt_id: { _in: receiptIds }, status: { _in: ["D", "P", "X"] },
      ...(filters.agency ? { agency_id: { _eq: filters.agency } } : {}) }, "id") : [];
  const totals = new Map<string, bigint>();
  for (const result of amounts) {
    const key = remitKey(result.agency_id, result.receipt_id);
    totals.set(key, (totals.get(key) ?? 0n) + centavos(result.amount));
  }
  const byAgencyMonth = latestRemittances(payments);
  const today = todayManila();
  const items = months.flatMap(month => agencies.filter(agency => !filters.agency || filters.agency === agency.id).flatMap(agency => {
    const receipt = receipts.get(month);
    const payment = byAgencyMonth.get(remitKey(agency.id, month));
    const withheld = receipt ? amountFromCentavos(totals.get(remitKey(agency.id, receipt.id)) ?? 0n) : null;
    if (!agency.is_active && !payment && (withheld === null || withheld === "0.00")) return [];
    const due = payment?.due_date ?? remittanceDeadline(month, { deadlineRule: agency.deadline_rule, deadlineDay: agency.deadline_day });
    const { status, label } = remittanceStatus(withheld, payment?.state ?? null, today, due, agency.reminder_days, payment?.payment_date);
    const reportStatus = status === "approved" ? (payment!.days_late > 0 ? "late" : "on_time") :
      status === "due" || status === "overdue" ? "open" : status;
    if (filters.status && reportStatus !== filters.status) return [];
    const remitted = payment?.state === "APPROVED" ? payment.withheld : "0.00";
    return [{ key: remitKey(agency.id, month), agency: payment?.agency_name ?? agency.display_name, code: payment?.agency_code ?? agency.short_code,
      month, withheld, remitted, outstanding: withheld === null ? null : amountFromCentavos(centavos(withheld) - centavos(remitted)),
      status, label, due, paidOn: payment?.payment_date ?? null, daysLate: payment?.days_late ?? null,
      penalty: payment?.entered_penalty ?? null, reference: payment?.payment_reference ?? null, remittanceId: payment?.id ?? null,
      receipt: receipt ? { id: receipt.id, revision: receipt.revision } : null,
      filedReceipt: payment ? { id: payment.source_snapshot.receiptId, revision: payment.source_snapshot.receiptRevision } : null }];
  }));
  sortReport(items, row => {
    const value = row[filters.sort as keyof typeof row];
    if (["withheld", "remitted", "outstanding", "penalty"].includes(filters.sort) && typeof value === "string") return moneyCents(value);
    return typeof value === "string" || typeof value === "number" ? value : null;
  }, row => row.key, filters.direction);
  const visible = pageReport(items, filters, full);
  const approvals = await readRemittanceApprovalIds(visible.flatMap(row => row.status === "approved" && row.remittanceId ? [row.remittanceId] : []));
  return { openMonth, page, total: items.length, hasMore: items.length > page * filters.size,
    agencies: agencies.map(row => ({ id: row.id, name: row.display_name })),
    totals: { withheld: moneyTotal(items, row => row.withheld), remitted: moneyTotal(items, row => row.remitted),
      outstanding: moneyTotal(items, row => row.outstanding), penalties: moneyTotal(items, row => row.status === "approved" ? row.penalty : null),
      awaiting: items.filter(row => row.withheld === null).length },
    items: visible.map(row => ({ ...row, approvalId: row.remittanceId ? approvals.get(row.remittanceId) ?? null : null })) };
}

export async function exportEmployeeLedger(params: URLSearchParams) {
  const report = await reportEmployeeLedger(params, true);
  const employeeId = parseInput(positiveId, params.get("employeeId"));
  const headers = ["Record type", "Employee ID", "Employee", "Loan", "Agency", "Agency loan reference", "Record reference", "Date or month",
      "Status / action", "Amount", "Expected", "Unpaid", "Estimated loan balance", "Agency statement balance", "Agency statement ID",
      "Current Payroll receipt", "Current revision", "Related payment reference", "Payment date", "Filed Payroll receipt", "Filed revision",
      "Remittance approval", "Included amount", "Details", "Remittance or refund instruction ID"];
  const rows = async function* () {
    for (const loan of report.loans) {
      const group = [employeeId, loan.employee, loan.reference, loan.agency, loan.agencyReference];
      const detail = await ledgerDetails(await readLoanSchedule(loan.id, report.month, employeeId), report.month);
      const statement = loan.agencyBalance.latest;
      yield ["Loan", ...group, String(loan.id), statement?.date ?? null, loan.status, null, null, null, loan.estimate,
        statement?.balance ?? null, statement?.id ?? null, null, null, null, null, null, null, null, null,
        `${loan.counted} of ${loan.term} installments · ${loan.alreadyPaid} before enrollment`];
      for (const row of detail.deductions) yield ["Deduction", ...group, null, row.month, row.status, row.actual, row.expected, row.unpaid,
        null, null, null, row.receiptId, row.revision, row.remittance?.reference ?? null, row.remittance?.date ?? null,
        row.remittance?.receiptId ?? null, row.remittance?.revision ?? null, row.remittance?.approvalId ?? null,
        row.remittance?.included ?? null, row.remittance?.state ?? null, row.remittance?.id ?? null];
      if (loan.renewal) yield ["Loan event", ...group, String(loan.renewal.replacementId), loan.renewal.month, "Renewed"];
      for (const event of detail.events) yield ["Loan event", ...group, String(event.revision), event.at, event.action, event.loanChange?.amount ?? null,
        null, null, null, null, event.loanChange?.statementId ?? null, null, null, null, null, null, null, null, null,
        [event.actor, event.remarks, event.reversed ? "Reversed" : "", event.reversedRevision ? "Reverses revision " + event.reversedRevision : "",
          event.loanChange?.month, event.loanChange?.reference].filter(Boolean).join(" · ")];
      for (const refund of detail.refunds) yield ["Refund", ...group, refund.reference, refund.month, refund.state, refund.amount,
        null, null, null, null, null, null, null, refund.payout?.reference ?? null, refund.payout?.date ?? null,
        null, null, null, null, null, refund.id];
    }
    yield ["Filtered loan total", employeeId, null, null, null, null, null, report.month, null, null, null, null, report.totalEstimated];
  };
  async function* normalizedRows() {
    yield headers;
    for await (const row of rows()) yield headers.map((_, index) => row[index] ?? null);
  }
  return csvReport("employee-ledger", normalizedRows(), report.total);
}

export async function exportAgencyRemittances(params: URLSearchParams) {
  const report = await reportAgencyRemittances(params, true);
  return csvReport("remittances", [
    ["Agency code", "Agency", "Payroll month", "Withheld", "Remitted principal", "Outstanding", "Due date", "Payment date",
      "Days late", "Penalty", "Payment reference", "Status", "Payroll receipt", "Revision", "Filed receipt", "Filed revision", "Remittance", "Approval"],
    ...report.items.map(row => [row.code, row.agency, row.month, row.withheld, row.remitted, row.outstanding, row.due, row.paidOn,
      row.daysLate, row.penalty, row.reference, row.label, row.receipt?.id ?? null, row.receipt?.revision ?? null,
      row.filedReceipt?.id ?? null, row.filedReceipt?.revision ?? null, row.remittanceId, row.approvalId]),
    [null, "Filtered total", null, report.totals.withheld, report.totals.remitted, report.totals.outstanding, null, null, null,
      report.totals.penalties, null, `${report.totals.awaiting} awaiting Payroll · Confirmed withholding and known outstanding · Approved penalties only`],
  ], report.total);
}
