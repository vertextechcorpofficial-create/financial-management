import "server-only";

import { z } from "zod";
import { overdueRequestCutoff, requestWaitingDays, REQUEST_SLA_DAYS } from "../approval/rules";
import { expectedRegularDeduction, monthAfter } from "../loans/monthly-payroll";
import { amountFromCentavos, projectLoanPosition } from "../loans/position";
import { centavos } from "../payroll-handoff/contract";
import { remittanceLiability } from "../remittances/approval/rules";
import { dayDifference, remitKey, remittanceDeadline, remittanceStatus } from "../remittances/preparation/rules";

import { readSavedBillingComparison } from "./agency-billing";
import { GOVERNMENT_LOAN_AGENCIES, GOVERNMENT_LOAN_PAYROLL_RESULTS, GOVERNMENT_LOAN_REMITTANCES, GOVERNMENT_LOAN_REQUESTS,
  GOVERNMENT_LOAN_STAFF_EVENTS, readGovernmentLoansItems, type GovernmentLoansCollection } from "./directus";
import { readGroups } from "./enrollment-sources";
import { readChangeInstructions, readOpenLoanMonth } from "./loan-changes";
import { listEnrollmentRecords } from "./loan-enrollment";
import { readMonthlyLoanSchedules } from "./loan-register";
import { isoDateTime } from "./loan-requests";
import { buildAgencyRollforward, readOpeningRollforward, signedRollforwardAmount } from "./month-end-rollforward";
import { readLatestReceipts, readPayrollPages, type PayrollReceipt } from "./payroll-month-store";
import { payrollMonthFilter } from "./payroll-month-filter";
import { nextPeriodCommand } from "./period-commands";
import { latestRemittances, readRemittanceOverview } from "./remittance-records";
import { flag, LoanRequestError, positiveId } from "./request-input";

const manilaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
const agencyRow = z.object({
  id: positiveId, display_name: z.string(), short_code: z.string(), is_active: flag, sends_billing: flag,
  deadline_rule: z.enum(["FIXED_DAY", "END_OF_MONTH"]), deadline_day: z.number().int().nullable(), reminder_days: z.number().int(),
});
const separatingEmployee = z.object({ user_id: positiveId, separation_date: z.iso.date() });
const amountsRow = z.object({ receipt_id: z.uuid(), agency_id: positiveId, sum: z.object({
  amount: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d+(\.\d{1,2})?$/)),
}) });
const countResult = z.object({ data: z.array(z.object({ count: z.object({ id: z.coerce.number().int().nonnegative() }) })).max(1) });

async function count(collection: GovernmentLoansCollection, filter: object) {
  const query = new URLSearchParams({ "aggregate[count]": "id", limit: "1", filter: JSON.stringify(filter) });
  const { data } = countResult.parse(await readGovernmentLoansItems(collection, query));
  return data[0]?.count.id ?? 0;
}

async function overdueEnrollments(now: Date) {
  let total = 0;
  for (let page = 1; ; page++) {
    const result = await listEnrollmentRecords(new URLSearchParams({ status: "ENROLLED", page: String(page) }));
    total += result.items.filter(({ enrollment }) => enrollment && requestWaitingDays(
      isoDateTime(enrollment.resubmittedAt ?? enrollment.encodedAt), now,
    ) > REQUEST_SLA_DAYS).length;
    if (!result.hasMore) return total;
  }
}

async function readWithholding(receipts: ReadonlyMap<string, PayrollReceipt>) {
  const ids = [...receipts.values()].map(row => row.id);
  const result = [];
  for (let start = 0; start < ids.length; start += 25) {
    for (let offset = 0; ; offset += 50) {
      const query = new URLSearchParams({
        "groupBy[]": "receipt_id", "aggregate[sum]": "amount",
        sort: "receipt_id,agency_id", limit: "50", offset: String(offset),
        filter: JSON.stringify({ receipt_id: { _in: ids.slice(start, start + 25) }, status: { _in: ["D", "P", "X"] } }),
      });
      query.append("groupBy[]", "agency_id");
      const { data } = z.object({ data: z.array(amountsRow).max(50) })
        .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_PAYROLL_RESULTS, query));
      result.push(...data.map(row => ({ receiptId: row.receipt_id, agencyId: row.agency_id, amount: centavos(row.sum.amount) })));
      if (data.length < 50) break;
    }
  }
  return result;
}

export async function readLoanDashboard(now = new Date()) {
  const month = await readOpenLoanMonth();
  const priorMonth = monthAfter(month, -1);
  const businessDate = manilaDate.format(now);
  const year = month.slice(0, 4);
  const sequence = await nextPeriodCommand(month);
  const cutoff = overdueRequestCutoff(now);
  const [agencies, receipts, payments, opening, loans, instructions, waitingRequests, waitingVerification, waitingPayments, filedDisputes, resolvedDisputes] =
    await Promise.all([
      readPayrollPages(GOVERNMENT_LOAN_AGENCIES, agencyRow, Object.keys(agencyRow.shape).join(","), {}, "id"),
      readLatestReceipts("1000-01", month),
      readRemittanceOverview({ _or: [payrollMonthFilter("payroll_month", "1000-01", month), { state: { _eq: "APPROVED" },
        payment_date: { _gte: year + "-01-01", _lte: businessDate } }] }),
      priorMonth < businessDate.slice(0, 7) ? readOpeningRollforward(priorMonth) : null,
      readMonthlyLoanSchedules(month),
      readChangeInstructions({ ...payrollMonthFilter("effective_month", "1000-01", month), action: { _in: ["REFUND", "SEPARATION"] },
        state: { _nin: ["PAID", "CANCELLED"] } }),
      count(GOVERNMENT_LOAN_REQUESTS, { status: { _eq: "REQUESTED" }, requested_at: { _nnull: true, _lt: cutoff } }),
      overdueEnrollments(now),
      count(GOVERNMENT_LOAN_REMITTANCES, { state: { _eq: "PENDING" }, submitted_at: { _lt: cutoff } }),
      count(GOVERNMENT_LOAN_STAFF_EVENTS, { kind: { _eq: "DISPUTE" }, revision: { _eq: 1 } }),
      count(GOVERNMENT_LOAN_STAFF_EVENTS, { kind: { _eq: "DISPUTE" }, status: { _eq: "RESOLVED" } }),
    ]);
  const withholding = await readWithholding(receipts);
  const rollforward = await buildAgencyRollforward(month, businessDate, agencies, receipts, withholding, payments, opening);
  const { penalty: penalties } = remittanceLiability(null,
    payments.filter(payment => payment.payment_date <= businessDate && payment.payment_date.startsWith(year + "-")));
  const groups = new Map<string, { agencyId: number; agency: string; program: string; count: number; amortization: bigint; remaining: bigint }>();
  const activeEmployees = new Set<number>();
  const pendingSeparation = new Set<number>();
  const finalPayMonths = new Map<number, string>();
  let activeLoans = 0;
  let monthlyAmortizations = 0n;
  let missed = 0;
  for (const { row, agency, schedule, history, coveredThrough } of loans) {
    const position = projectLoanPosition({ ...schedule, openMonth: month, businessDate, coveredThrough, deductions: history, statement: null });
    for (const deduction of history) {
      if (deduction.status === "X" && deduction.month > (finalPayMonths.get(row.id) ?? "")) finalPayMonths.set(row.id, deduction.month);
    }
    monthlyAmortizations += centavos(expectedRegularDeduction(schedule, history, month));
    if (!position.active) continue;
    activeLoans++;
    if (position.status === "ACTIVE" || position.status === "SUSPENDED") activeEmployees.add(row.employee_user_id);
    if (position.status === "FINAL_PAY_REQUESTED") pendingSeparation.add(row.id);
    if (position.status === "ACTIVE" && position.lastDeductionShort) missed++;
    const key = JSON.stringify([row.agency_id, row.form.program]);
    const group = groups.get(key) ?? { agencyId: row.agency_id, agency, program: row.form.program, count: 0, amortization: 0n, remaining: 0n };
    group.count++;
    group.amortization += centavos(position.amortization);
    group.remaining += centavos(position.estimate ?? "0.00");
    groups.set(key, group);
  }

  const separating = await readGroups<z.output<typeof separatingEmployee>, number>("user", separatingEmployee, [...activeEmployees],
    ids => ({ user_id: { _in: ids }, separation_date: { _nnull: true } }), "user_id");
  const refund = instructions.filter(row => row.action === "REFUND").length;
  for (const row of instructions) {
    if (row.action === "SEPARATION" && (finalPayMonths.get(row.request_id) ?? "") < row.effective_month) pendingSeparation.add(row.request_id);
  }

  const alerts: { key: string; title: string; detail: string; count: number;
    severity: "critical" | "warning" | "info" }[] = [];
  function alert(key: string, title: string, total: number, detail = "", severity: "critical" | "warning" | "info" = "warning") {
    if (!total) return;
    alerts.push({ key, title, count: total, detail, severity });
  }

  const monthByReceipt = new Map([...receipts].map(([period, receipt]) => [receipt.id, period]));
  const payable = new Map<string, bigint>();
  const periodsByAgency = new Map<number, Set<string>>();
  for (const row of withholding) {
    const period = monthByReceipt.get(row.receiptId)!;
    payable.set(remitKey(row.agencyId, period), row.amount);
    if (row.amount > 0n) {
      const periods = periodsByAgency.get(row.agencyId) ?? new Set([month, priorMonth]);
      periods.add(period);
      periodsByAgency.set(row.agencyId, periods);
    }
  }
  const currentPayments = latestRemittances(payments.filter(payment => payment.state !== "APPROVED" || payment.payment_date <= businessDate));
  const deadlines = [];
  const deadlineAlerts: { key: string; agency: string; month: string; due: string; overdue: boolean; residual: boolean }[] = [];
  for (const agency of agencies) {
    const periods = periodsByAgency.get(agency.id) ?? [month, priorMonth];
    for (const period of periods) {
      const key = remitKey(agency.id, period);
      const amount = payable.get(key) ?? 0n;
      const payment = currentPayments.get(key);
      if (!agency.is_active && amount === 0n && !payment) continue;
      const withheld = receipts.has(period) ? amountFromCentavos(amount) : null;
      const due = payment && payment.state !== "RETURNED" ? payment.due_date : remittanceDeadline(period, {
        deadlineRule: agency.deadline_rule, deadlineDay: agency.deadline_day,
      });
      const status = remittanceStatus(withheld, payment?.state ?? null, businessDate, due, agency.reminder_days, payment?.payment_date);
      const residual = payment?.state === "APPROVED" && amount > centavos(payment.withheld);
      if (period === month || period === priorMonth) {
        deadlines.push({ key, agencyId: agency.id, agency: agency.display_name, month: period, withheld, due,
          daysUntilDue: dayDifference(businessDate, due),
          label: residual ? "Balance to reconcile" : status.label, status: status.status });
      }
      if (residual || status.reminder) deadlineAlerts.push({ key, agency: agency.display_name, month: period, due,
        overdue: dayDifference(due, businessDate) > 0, residual });
    }
  }
  deadlineAlerts.sort((a, b) => a.due.localeCompare(b.due) || a.key.localeCompare(b.key));
  if (deadlineAlerts.length) {
    const overdue = deadlineAlerts.filter(row => row.overdue).length;
    const residual = deadlineAlerts.filter(row => row.residual).length;
    const first = deadlineAlerts[0];
    const summary = [overdue ? overdue + " overdue" : "", residual ? residual + " balance changed" : ""]
      .filter(Boolean).join(" · ");
    alert("deadlines", overdue ? "Overdue remittance deadlines" : residual ? "Remittance balances changed" : "Remittances due soon",
      deadlineAlerts.length,
      first.agency + " · " + first.month + " · due " + first.due +
      (deadlineAlerts.length > 1 ? " · +" + (deadlineAlerts.length - 1) + " more" : "") + (summary ? " · " + summary : ""),
      overdue ? "critical" : "warning");
  }
  alert("loan-approval", "Loan requests past the approval SLA", waitingRequests, "", "critical");
  alert("verification", "Enrollments past the verification SLA", waitingVerification, "", "critical");
  alert("remittance-approval", "Remittances past the approval SLA", waitingPayments, "", "critical");
  alert("payroll", "Payroll receipt is missing", receipts.has(month) ? 0 : 1, month, "critical");
  alert("final-pay", "Loans awaiting final-pay results", pendingSeparation.size, "", "warning");
  alert("separation", "Separating employees with active loans", separating.length, "", "info");

  for (const period of [month, priorMonth]) {
    let projected = 0;
    let actual = 0;
    let missing = 0;
    for (const agency of agencies) {
      if (!agency.sends_billing || (!agency.is_active && !payable.has(remitKey(agency.id, period)))) continue;
      const comparison = await readSavedBillingComparison(agency.id, period, receipts.get(period) ?? null);
      if (!comparison) {
        if ((payable.get(remitKey(agency.id, period)) ?? 0n) > 0n) missing++;
      } else if (comparison.mode === "actual") actual += comparison.totals.discrepancies;
      else projected += comparison.totals.discrepancies;
    }
    alert("billing:actual:" + period, "Actual billing differences", actual, period, "warning");
    alert("billing:projected:" + period, "Projected billing differences", projected, period, "warning");
    alert("billing:missing:" + period, "Expected agency bills are missing", missing, period, "warning");
  }
  alert("missed", "Active loans with a partial or missed deduction", missed, "", "warning");
  alert("refund", "Employee refunds awaiting payout", refund, "", "warning");
  alert("disputes", "Unresolved posting disputes", filedDisputes - resolvedDisputes, "", "info");

  const severityOrder = { critical: 0, warning: 1, info: 2 } as const;
  const alertOrder = ["payroll", "loan-approval", "verification", "remittance-approval", "deadlines",
    "billing", "missed", "final-pay", "refund", "separation", "disputes"];
  const alertRank = (key: string) => {
    const index = alertOrder.indexOf(key.split(":")[0]);
    return index === -1 ? alertOrder.length : index;
  };
  alerts.sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity] ||
    alertRank(left.key) - alertRank(right.key) || left.title.localeCompare(right.title));

  if ((await nextPeriodCommand(month)).sequence !== sequence.sequence) {
    throw new LoanRequestError(409, "Government Loans activity changed while loading. Refresh the dashboard.");
  }
  const { closing, opening: openingBalance, remitted } = rollforward.totals;
  const knownBalance = (balance: string | null, start: string, paid: string) =>
    balance ?? amountFromCentavos(signedRollforwardAmount(start) - signedRollforwardAmount(paid));
  const programTotals = [...groups.values()].reduce((total, row) => ({
    count: total.count + row.count, amortization: total.amortization + row.amortization, remaining: total.remaining + row.remaining,
  }), { count: 0, amortization: 0n, remaining: 0n });
  return {
    month, businessDate, year, refreshedAt: now.toISOString(), activeLoans, activeEmployees: activeEmployees.size,
    monthlyAmortizations: amountFromCentavos(monthlyAmortizations),
    withheld: knownBalance(closing, openingBalance, remitted),
    payrollReceived: rollforward.complete, penalties, alerts,
    agencyBalances: rollforward.rows.map(row => ({ agencyId: row.agencyId, agency: row.agency, code: row.code,
      withheld: knownBalance(row.closing, row.opening, row.remitted) })).filter(row => row.withheld !== "0.00"),
    deadlines: deadlines.sort((a, b) => b.month.localeCompare(a.month) || a.due.localeCompare(b.due) || a.agency.localeCompare(b.agency)),
    programs: [...groups.values()].sort((a, b) => a.agency.localeCompare(b.agency) || a.program.localeCompare(b.program))
      .map(row => ({ ...row, amortization: amountFromCentavos(row.amortization), remaining: amountFromCentavos(row.remaining) })),
    programTotals: { count: programTotals.count, amortization: amountFromCentavos(programTotals.amortization),
      remaining: amountFromCentavos(programTotals.remaining) },
  };
}
