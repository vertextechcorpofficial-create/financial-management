import "server-only";

import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { exactMoney } from "../enrollment/rules";
import { projectLoanPosition } from "../loans/position";
import type { LoanSchedule } from "../loans/monthly-payroll";
import { registerCsvHeader, registerCsvRow } from "../loans/register-csv";
import {
  registerStatusLabels, registerViews, statementSources, type AgencyStatement, type LoanRegisterPage,
  type RegisterLoan, type RegisterLoanDetail, type RegisterStatus, type RegisterView,
} from "../loans/types";
import { GOVERNMENT_LOAN_AGENCIES, GOVERNMENT_LOAN_AGENCY_STATEMENTS, GOVERNMENT_LOAN_REQUESTS, readGovernmentLoansItems } from "./directus";
import { enrollmentTerms, readOpenMonth } from "./loan-enrollment";
import { readEnrollmentRows } from "./enrollment-sources";
import { isoDateTime, referenceFor } from "./loan-requests";
import { readRegisterRenewals } from "./payroll-handoff-store";
import { payrollCoveredThrough, readApprovedScheduleChanges, readLatestLoanPayroll, readLatestReceipts } from "./payroll-month-store";
import { flag, LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";

export const statementAmount = /^\d{1,13}(\.\d{1,2})?$/;
export const statementRow = z.object({
  id: z.uuid(), statement_date: z.iso.date(),
  balance: z.union([z.string(), z.number()]).transform(String).refine(value => statementAmount.test(value)).transform(exactMoney),
  source: z.enum(statementSources), note: z.string().nullable(), file_name: z.string().nullable(),
  recorded_by: z.string(), recorded_at: z.string(), recorded_revision: positiveId,
});
const statementFields = Object.keys(statementRow.shape);
const latestOrder = "-statement_date,-recorded_at,-recorded_revision,-id";
const pageSize = 25;
const batchSize = 50;

const enrolledRow = z.object({
  id: positiveId, revision: positiveId, requested_at: z.string().nullable(),
  employee_user_id: positiveId, employee_name: z.string().nullable(), agency_id: positiveId, agency_name: z.string().nullable(),
  form: z.object({ program: z.string() }), enrollment: z.object(enrollmentTerms.shape), payroll_loan_id: positiveId.nullable(),
  agency_statements: z.array(statementRow).max(1),
});
const fields = [...Object.keys(enrolledRow.shape).filter(field => field !== "agency_statements"),
  ...statementFields.map(field => "agency_statements." + field)].join(",");
const employeeRow = z.object({ user_id: positiveId, user_department: positiveId.nullable() });
const departmentRow = z.object({ department_id: positiveId, department_name: z.string().nullable() });
const agencyRow = z.object({ id: positiveId, full_name: z.string(), catch_up: flag });

export function agencyStatement(data: z.output<typeof statementRow>): AgencyStatement {
  return {
    id: data.id, date: data.statement_date, balance: data.balance, source: data.source, note: data.note,
    attachmentName: data.file_name, recordedBy: data.recorded_by, recordedAt: isoDateTime(data.recorded_at),
  };
}

async function readEnrolled(filter: object, limit: number) {
  const query = new URLSearchParams({
    fields, sort: "-id", limit: String(limit), filter: JSON.stringify({ ...filter, status: { _eq: "ACTIVE" }, enrollment: { _nnull: true } }),
    "deep[agency_statements][_limit]": "1", "deep[agency_statements][_sort]": latestOrder,
  });
  const { data } = z.object({ data: z.array(enrolledRow).max(limit) })
    .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUESTS, query));
  return data;
}

async function period() {
  const openMonth = await readOpenMonth();
  if (!openMonth) throw new LoanRequestError(503, "Set the Government Loans open month before viewing loans.");
  return { openMonth, businessDate: todayManila() };
}

async function referenceRows<T>(collection: "user" | "department" | typeof GOVERNMENT_LOAN_AGENCIES,
  schema: z.ZodType<T>, fields: string, key: string, values: number[]) {
  const ids = [...new Set(values)];
  return ids.length ? readEnrollmentRows(collection, schema, fields, { [key]: { _in: ids } }, ids.length) : [];
}

type Enrolled = z.output<typeof enrolledRow>;

async function schedules(rows: Enrolled[], month: string) {
  const [agencies, renewals, receipts, changes] = await Promise.all([
    referenceRows(GOVERNMENT_LOAN_AGENCIES, agencyRow, "id,full_name,catch_up", "id", rows.map(row => row.agency_id)),
    readRegisterRenewals(rows.flatMap(row => row.payroll_loan_id === null ? [] : [row.payroll_loan_id])),
    readLatestReceipts(rows.map(row => row.enrollment.firstDeductionMonth).sort()[0], month),
    readApprovedScheduleChanges(rows.map(row => row.id)),
  ]);
  const deductions = await readLatestLoanPayroll(rows.map(row => row.id), receipts);
  const agencyById = new Map(agencies.map(row => [row.id, row]));
  return rows.map(row => {
    const enrollment = row.enrollment;
    const agency = agencyById.get(row.agency_id);
    const successor = row.payroll_loan_id === null ? undefined : renewals.get(row.payroll_loan_id);
    const effective = changes.get(row.id) ?? [];
    const schedule: LoanSchedule = {
      firstDeductionMonth: enrollment.firstDeductionMonth, term: enrollment.installmentCount,
      alreadyPaid: enrollment.installmentsPaid, amortization: enrollment.monthlyAmortization, catchUp: agency?.catch_up ?? false,
      changes: successor ? [...effective, { kind: "RENEWED", month: successor.effectiveMonth, replacementId: successor.enrollmentId }] : effective,
    };
    return {
      row, schedule, history: deductions.get(row.id) ?? [],
      receipts,
      coveredThrough: payrollCoveredThrough(receipts, schedule.firstDeductionMonth, month),
      reference: row.requested_at ? referenceFor(row.id) : "GL-" + String(row.id).padStart(6, "0"),
      employee: row.employee_name ?? "Employee " + row.employee_user_id,
      agency: agency?.full_name ?? row.agency_name ?? "Agency " + row.agency_id,
    };
  });
}

export async function readMonthlyLoanSchedules(month: string, employeeId?: number) {
  const result: Awaited<ReturnType<typeof schedules>> = [];
  for (let beforeId: number | null = null; ; ) {
    const rows: Enrolled[] = await readEnrolled({
      ...(beforeId === null ? {} : { id: { _lt: beforeId } }),
      ...(employeeId === undefined ? {} : { employee_user_id: { _eq: employeeId } }),
    }, batchSize);
    if (rows.length) result.push(...await schedules(rows, month));
    if (rows.length < batchSize) return result;
    beforeId = rows[rows.length - 1].id;
  }
}

export async function readBillingLoanSchedules(month: string, agencyId: number, ids: number[]) {
  const result: Awaited<ReturnType<typeof schedules>> = [];
  for (let start = 0; start < ids.length; start += batchSize) {
    const group = ids.slice(start, start + batchSize);
    const rows = await readEnrolled({ agency_id: { _eq: agencyId }, id: { _in: group } }, group.length);
    if (rows.length) result.push(...await schedules(rows, month));
  }
  return result;
}

export async function readLoanSchedule(id: number, month: string, owner?: number) {
  const rows = await readEnrolled({ id: { _eq: id }, ...(owner === undefined ? {} : { employee_user_id: { _eq: owner } }) }, 1);
  if (!rows.length) throw new LoanRequestError(404, "Verified loan could not be found.");
  return (await schedules(rows, month))[0];
}

async function project(rows: Enrolled[], period: { openMonth: string; businessDate: string }): Promise<RegisterLoan[]> {
  if (!rows.length) return [];
  const [employees, projected] = await Promise.all([
    referenceRows("user", employeeRow, "user_id,user_department", "user_id", rows.map(row => row.employee_user_id)),
    schedules(rows, period.openMonth),
  ]);
  const departments = await referenceRows("department", departmentRow, "department_id,department_name", "department_id",
    employees.flatMap(employee => employee.user_department === null ? [] : [employee.user_department]));
  const departmentByEmployee = new Map(employees.map(row => [row.user_id, row.user_department]));
  const names = new Map(departments.map(row => [row.department_id, row.department_name]));

  return projected.map(({ row, schedule, history, reference, employee, agency, coveredThrough }) => {
    const enrollment = row.enrollment;
    const departmentId = departmentByEmployee.get(row.employee_user_id) ?? null;
    return {
      id: row.id, revision: row.revision, reference,
      agencyReference: enrollment.agencyReference, employee,
      department: departmentId === null ? null : names.get(departmentId) ?? null, departmentId,
      agencyId: row.agency_id, agency,
      program: row.form.program, principal: enrollment.originalPrincipal, firstDeductionMonth: enrollment.firstDeductionMonth,
      ...projectLoanPosition({
        ...period, ...schedule, deductions: history, coveredThrough,
        statement: row.agency_statements[0] ? agencyStatement(row.agency_statements[0]) : null,
      }),
    };
  });
}

const queryInput = z.object({
  q: z.string().trim().max(120).default(""), view: z.enum(Object.keys(registerViews) as RegisterView[]).default("active"),
  agency: positiveId.optional(), department: positiveId.optional(), program: z.string().trim().min(1).max(160).optional(),
  status: z.enum(Object.keys(registerStatusLabels) as RegisterStatus[]).optional(),
  short: z.literal("1").optional(), flagged: z.literal("1").optional(), needsUpdate: z.literal("1").optional(),
  page: pageNumber, format: z.enum(["csv"]).optional(),
});

export async function listLoanRegister(params: URLSearchParams, agencyBalances = false): Promise<LoanRegisterPage | Response> {
  const input = parseInput(queryInput, Object.fromEntries(params));
  const current = await period();
  const systemRef = /^(?:GLR?-)?0*([1-9]\d{0,9})$/i.exec(input.q)?.[1];
  const search = input.q ? { _or: [
    { employee_name: { _icontains: input.q } }, { live_reference_key: { _icontains: input.q } },
    ...(systemRef ? [{ id: { _eq: Number(systemRef) } }] : []),
  ] } : {};
  const filter = { ...search, ...(input.agency ? { agency_id: { _eq: input.agency } } : {}) };
  const view = agencyBalances ? "active" : input.view;
  const matchesPage = (count: number) => count > (input.page - 1) * pageSize && count <= input.page * pageSize;
  const items: RegisterLoan[] = [];
  const csv = input.format === "csv" ? [registerCsvHeader] : null;
  const agencies = new Map<number, string>();
  const departments = new Map<number, string>();
  const programs = new Set<string>();
  const summary = { active: 0, withStatement: 0, flagged: 0, needsUpdate: 0 };
  let total = 0;
  let beforeId: number | undefined;

  for (;;) {
    const batch = await readEnrolled({ ...filter, ...(beforeId === undefined ? {} : { id: { _lt: beforeId } }) }, batchSize);
    for (const loan of await project(batch, current)) {
      if (view !== "all" && loan.active !== (view === "active")) continue;
      agencies.set(loan.agencyId, loan.agency);
      if (loan.departmentId && loan.department) departments.set(loan.departmentId, loan.department);
      if (loan.program) programs.add(loan.program);
      const { latest, stale, flagged } = loan.agencyBalance;
      const needsUpdate = stale || !latest;
      if (loan.active) {
        summary.active++;
        if (latest) summary.withStatement++;
        if (flagged) summary.flagged++;
        if (needsUpdate) summary.needsUpdate++;
      }
      if ((input.status && loan.status !== input.status) || (input.program && loan.program !== input.program) ||
        (input.department && loan.departmentId !== input.department) || (input.short && !loan.lastDeductionShort) ||
        (input.flagged && !flagged) || (input.needsUpdate && !needsUpdate)) continue;

      total++;
      if (csv) csv.push(registerCsvRow(loan));
      else if (matchesPage(total)) items.push(loan);
    }
    if (batch.length < batchSize) break;
    beforeId = batch[batch.length - 1].id;
  }

  if (csv) return new Response(csv.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "X-Content-Type-Options": "nosniff" },
  });
  const options = (values: Map<number, string>) => [...values].map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  return { items, total, hasMore: total > input.page * pageSize, summary,
    filters: { agencies: options(agencies), departments: options(departments), programs: [...programs].sort((a, b) => a.localeCompare(b)) } };
}

export async function readRegisterLoan(id: number) {
  const [current, rows] = await Promise.all([period(), readEnrolled({ id: { _eq: id } }, 1)]);
  const [loan] = await project(rows, current);
  if (!loan) throw new LoanRequestError(404, "Verified loan could not be found.");
  return { loan, ...current };
}

export async function getRegisterLoan(id: number, params: URLSearchParams): Promise<RegisterLoanDetail> {
  const page = parseInput(pageNumber, params.get("page") ?? undefined);
  const current = await readRegisterLoan(id);
  const history = await readEnrollmentRows(GOVERNMENT_LOAN_AGENCY_STATEMENTS, statementRow, statementFields.join(","),
    { request_id: { _eq: id } }, pageSize + 1, latestOrder, (page - 1) * pageSize);
  return { ...current, statements: { items: history.slice(0, pageSize).map(agencyStatement), hasMore: history.length > pageSize } };
}
