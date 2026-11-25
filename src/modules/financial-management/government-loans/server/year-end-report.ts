import "server-only";

import { z } from "zod";
import { amountFromCentavos } from "../loans/position";
import { centavos } from "../payroll-handoff/contract";
import { GOVERNMENT_LOAN_AGENCIES, GOVERNMENT_LOAN_PAYROLL_RESULTS } from "./directus";
import { readEnrollmentRows, readGroups } from "./enrollment-sources";
import { readOpenLoanMonth } from "./loan-changes";
import { payrollMoney, readLatestReceipts, readPayrollPages, receiptSummary } from "./payroll-month-store";
import { readRemittanceApprovalIds, readReportRemittances } from "./remittance-records";
import { employeeName } from "./request-assessment";
import { LoanRequestError, parseInput, positiveId } from "./request-input";
import { csvReport, moneyCents, moneyTotal, pageReport, reportQuery, sortReport } from "./report-output";

const query = z.object({ year: z.string().regex(/^[1-9]\d{3}$/).optional(), ...reportQuery("year", "name"),
  q: z.string().trim().max(120).default(""), department: positiveId.optional() });
const resultRow = z.object({ employee_id: positiveId, agency_id: positiveId, amount: payrollMoney });
const employeeRow = z.object({ user_id: positiveId, user_fname: z.string().nullable(), user_mname: z.string().nullable(),
  user_lname: z.string().nullable(), user_department: positiveId.nullish() });
const agencyRow = z.object({ id: positiveId, display_name: z.string(), short_code: z.string() });
const departmentRow = z.object({ department_id: positiveId, department_name: z.string().nullable() });
export async function reportYearEnd(params: URLSearchParams, full = false) {
  const filters = parseInput(query, Object.fromEntries(params));
  const open = await readOpenLoanMonth();
  const openYear = open.slice(0, 4);
  const year = filters.year ?? openYear;
  if (year > openYear) throw new LoanRequestError(422, "Choose the open Payroll year or an earlier year.");
  const start = year + "-01";
  const end = year === openYear ? open : year + "-12";
  const [receipts, payments, agencies] = await Promise.all([
    readLatestReceipts(start, end),
    readReportRemittances({ state: { _eq: "APPROVED" }, _or: [
      { payroll_month: { _gte: start, _lte: end } },
      { payment_date: { _gte: start + "-01", _lte: year + "-12-31" } },
    ] }),
    readPayrollPages(GOVERNMENT_LOAN_AGENCIES, agencyRow, Object.keys(agencyRow.shape).join(","), {}, "id"),
  ]);
  const months = Array.from({ length: Number(end.slice(5)) }, (_, i) => {
    const month = year + "-" + String(i + 1).padStart(2, "0");
    const receipt = receipts.get(month);
    return { month, receipt: receipt ? receiptSummary(receipt) : null };
  });
  const employeeAmounts = new Map<number, Map<number, bigint>>();
  const deductions = new Map<number, bigint>();
  if (receipts.size) {
    // Aggregate while reading each page so individual Payroll rows do not accumulate in memory.
    const filter = { receipt_id: { _in: [...receipts.values()].map(receipt => receipt.id) }, status: { _in: ["D", "P", "X"] } };
    for await (const result of yearlyRows(filter)) {
      const amount = centavos(result.amount);
      if (amount === 0n) continue;
      const employee = employeeAmounts.get(result.employee_id) ?? new Map<number, bigint>();
      employee.set(result.agency_id, (employee.get(result.agency_id) ?? 0n) + amount);
      employeeAmounts.set(result.employee_id, employee);
      deductions.set(result.agency_id, (deductions.get(result.agency_id) ?? 0n) + amount);
    }
  }
  const [employees, approvalIds] = await Promise.all([
    readGroups<z.output<typeof employeeRow>, number>("user", employeeRow, [...employeeAmounts.keys()],
      ids => ({ user_id: { _in: ids } }), "user_id"),
    readRemittanceApprovalIds(payments.map(row => row.id)),
  ]);
  const employeeById = new Map(employees.map(row => [row.user_id, row]));
  const departments = await readGroups<z.output<typeof departmentRow>, number>("department", departmentRow,
    employees.flatMap(row => row.user_department ? [row.user_department] : []),
    ids => ({ department_id: { _in: ids } }), "department_id");
  const deptById = new Map(departments.map(row => [row.department_id, row.department_name]));
  const paymentByAgency = new Map<number, typeof payments>();
  for (const row of payments) {
    const group = paymentByAgency.get(row.agency_id) ?? [];
    group.push(row);
    paymentByAgency.set(row.agency_id, group);
  }
  const agencyById = new Map(agencies.map(row => [row.id, row]));
  const summaries = [...new Set([...deductions.keys(), ...paymentByAgency.keys()])].map(id => {
    const group = paymentByAgency.get(id) ?? [];
    const rows = group.map(row => ({
      id: row.id, approvalId: approvalIds.get(row.id) ?? null, reference: row.payment_reference,
      payrollMonth: row.payroll_month, paymentDate: row.payment_date, daysLate: row.days_late,
      principal: row.withheld, penalty: row.entered_penalty,
      inPayrollYear: row.payroll_month >= start && row.payroll_month <= end,
      inPaymentYear: row.payment_date.slice(0, 4) === year,
    }));
    const withheld = deductions.get(id) ?? 0n;
    const payrollYear = rows.filter(row => row.inPayrollYear);
    const paymentYear = rows.filter(row => row.inPaymentYear);
    const remitted = payrollYear.reduce((total, row) => total + centavos(row.principal), 0n);
    const penalties = paymentYear.reduce((total, row) => total + centavos(row.penalty), 0n);
    const agency = agencyById.get(id);
    return { id, agency: agency?.display_name ?? group[0]?.agency_name ?? "Agency " + id,
      code: agency?.short_code ?? group[0]?.agency_code ?? String(id), withheld: amountFromCentavos(withheld),
      remitted: amountFromCentavos(remitted), outstanding: amountFromCentavos(withheld - remitted),
      late: payrollYear.filter(row => row.daysLate > 0).length, penalties: amountFromCentavos(penalties), payments: rows };
  }).sort((a, b) => a.agency.localeCompare(b.agency) || a.id - b.id);

  const words = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = [...employeeAmounts].flatMap(([id, amounts]) => {
    const person = employeeById.get(id);
    const name = person ? employeeName(person) : "Employee " + id;
    const departmentId = person?.user_department ?? null;
    if ((filters.department && filters.department !== departmentId) ||
        !words.every(word => (name + " " + id).toLowerCase().includes(word))) return [];
    return [{ id, name, department: departmentId === null ? null : deptById.get(departmentId) ?? null,
      agencies: [...amounts].map(([agencyId, amount]) => ({ agencyId, amount: amountFromCentavos(amount) })),
      total: amountFromCentavos([...amounts.values()].reduce((sum, amount) => sum + amount, 0n)) }];
  });
  sortReport(matches, row => filters.sort === "total" ? moneyCents(row.total) :
    filters.sort === "department" ? row.department : row.name, row => String(row.id), filters.direction);
  const matchedByAgency = new Map<number, bigint>();
  for (const row of matches) for (const { agencyId, amount } of row.agencies) {
    matchedByAgency.set(agencyId, (matchedByAgency.get(agencyId) ?? 0n) + centavos(amount));
  }
  const grand = (key: "withheld" | "remitted" | "outstanding" | "penalties") => moneyTotal(summaries, row => row[key]);
  return { year, openYear, end, months, complete: months.every(month => month.receipt), agencies: summaries,
    totals: { withheld: grand("withheld"), remitted: grand("remitted"), outstanding: grand("outstanding"),
      late: summaries.reduce((sum, row) => sum + row.late, 0), penalties: grand("penalties") },
    filteredWithheld: moneyTotal(matches, row => row.total),
    filteredAgencies: summaries.filter(row => matchedByAgency.has(row.id)).map(row => ({
      id: row.id, agency: row.agency, code: row.code, withheld: amountFromCentavos(matchedByAgency.get(row.id) ?? 0n),
    })),
    departments: departments.filter(row => row.department_name).sort((a, b) => a.department_name!.localeCompare(b.department_name!))
      .map(row => ({ id: row.department_id, name: row.department_name! })),
    employees: pageReport(matches, filters, full),
    totalEmployees: matches.length, hasMore: matches.length > filters.page * filters.size };
}

export async function exportYearEnd(params: URLSearchParams) {
  const report = await reportYearEnd(params, true);
  const { year, agencies } = report;
  const moneyByAgency = (row: typeof report.employees[number]) =>
    agencies.map(agency => row.agencies.find(item => item.agencyId === agency.id)?.amount ?? "0.00");
  return csvReport("year-end-" + year, [
    ["Payroll year", "Through", "Coverage"], [year, report.end, report.complete ? "Complete" : "Incomplete"],
    ["Payroll month", "Status", "Receipt ID", "Revision"],
    ...report.months.map(({ month, receipt }) => [month, receipt ? "Confirmed" : "Awaiting Payroll", receipt?.id ?? null, receipt?.revision ?? null]),
    [],
    ["Filtered employees", "Employee ID", "Department", ...agencies.map(row => row.code), "Total withheld"],
    ...report.employees.map(row => [row.name, row.id, row.department, ...moneyByAgency(row), row.total]),
    ["Filtered employee and agency totals", null, null,
      ...agencies.map(agency => report.filteredAgencies.find(row => row.id === agency.id)?.withheld ?? "0.00"), report.filteredWithheld],
    [],
    ["Full-year reconciliation", "Agency code", "Withheld (Payroll year)", "Remitted principal (Payroll year)", "Outstanding (Payroll year)",
      "Late remittances (Payroll year)", "Penalties (payment year)"],
    ...agencies.map(row => [row.agency, row.code, row.withheld, row.remitted, row.outstanding, row.late, row.penalties]),
    ["Full-year totals", null, report.totals.withheld, report.totals.remitted, report.totals.outstanding, report.totals.late, report.totals.penalties],
    [],
    ["Agency", "Payroll month", "Payment date", "Reference", "Remittance ID", "Approval ID", "Principal", "Penalty",
      "Included in Payroll year", "Included in payment year"],
    ...agencies.flatMap(row => row.payments.map(payment => [row.code, payment.payrollMonth, payment.paymentDate, payment.reference,
      payment.id, payment.approvalId, payment.principal, payment.penalty, payment.inPayrollYear ? "Yes" : "No", payment.inPaymentYear ? "Yes" : "No"])),
  ], report.totalEmployees);
}

async function* yearlyRows(filter: object) {
  const limit = 50;
  const fields = Object.keys(resultRow.shape).join(",");
  for (let offset = 0; ; offset += limit) {
    const batch = await readEnrollmentRows(GOVERNMENT_LOAN_PAYROLL_RESULTS, resultRow, fields, filter, limit, "id", offset);
    yield* batch;
    if (batch.length < limit) return;
  }
}
