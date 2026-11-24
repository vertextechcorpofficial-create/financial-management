import "server-only";

import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { cents, positiveMoney, requestCapacity, requiredFields } from "../requests/request-rules";
import type { AgencyChoice, EmployeeChoice, EmployeeSummary, PayrollLoan, RequestAssessment, RequestCheck, RequestForm } from "../requests/types";
import type { Agency } from "../remittances/agencies/types";
import { AgencyError, listAgencies, readAgency } from "./agencies";
import { readGovernmentLoansItems, type GovernmentLoansCollection } from "./directus";
import { flag, invalidDraftFields, LoanRequestError, pageNumber, positiveId } from "./request-input";

async function rows<T>(collection: GovernmentLoansCollection, schema: z.ZodType<T>, fields: string, filter: object,
  args: { limit: number; sort?: string; offset?: number }) {
  const query = new URLSearchParams({
    fields, filter: JSON.stringify(filter), limit: String(args.limit),
    ...(args.sort ? { sort: args.sort } : {}), ...(args.offset ? { offset: String(args.offset) } : {}),
  });
  return z.object({ data: z.array(schema).max(args.limit) }).parse(await readGovernmentLoansItems(collection, query)).data;
}

const employeeChoiceRow = z.object({
  user_id: positiveId, user_fname: z.string().nullable(), user_lname: z.string().nullable(),
  user_mname: z.string().nullable(), user_department: positiveId.nullable(),
});
const employeeRow = employeeChoiceRow.extend({
  is_employee: flag, is_deleted: flag, is_blocked: flag,
  employment_status_id: positiveId.nullable(), separation_date: z.iso.date().nullable(),
  user_position: z.string().nullable(), user_dateOfHire: z.iso.date().nullable(),
  user_sss: z.string().nullable(), user_pagibig: z.string().nullable(),
  user_contact: z.string().nullable(), user_email: z.string().nullable(),
});
const department = z.object({ department_id: positiveId, department_name: z.string().nullable() });
const employmentStatus = z.object({ id: positiveId, name: z.string() });
const employeeName = (employee: z.infer<typeof employeeChoiceRow>) =>
  [employee.user_fname, employee.user_mname, employee.user_lname].filter(part => part?.trim()).join(" ") || "Employee " + employee.user_id;

async function getDepartments(choices: z.infer<typeof employeeChoiceRow>[]) {
  const ids = [...new Set(choices.flatMap(choice => choice.user_department ? [choice.user_department] : []))];
  const list = ids.length ? await rows("department", department, "department_id,department_name", {
    department_id: { _in: ids },
  }, { limit: ids.length }) : [];
  return new Map(list.map(item => [item.department_id, item.department_name]));
}

const choiceFields = Object.keys(employeeChoiceRow.shape).join(",");
const employeeFields = Object.keys(employeeRow.shape).join(",");
const employeeChoice = (row: z.infer<typeof employeeChoiceRow>, names: Map<number, string | null>): EmployeeChoice => ({
  id: row.user_id, name: employeeName(row),
  department: row.user_department === null ? null : names.get(row.user_department) ?? null,
});

const lookupInput = z.object({ q: z.string().trim().max(120).default(""), page: pageNumber, exclude: positiveId.optional() });
export async function listRequestEmployees(params: URLSearchParams) {
  const input = lookupInput.safeParse(Object.fromEntries(params));
  if (!input.success) throw new LoanRequestError(422, "Choose a valid employee search.");
  const { q, page, exclude } = input.data;
  const limit = 12;
  const filter = {
    is_employee: { _eq: true },
    ...(exclude ? { user_id: { _neq: exclude } } : {}),
    _and: [
      { _or: [{ is_deleted: { _null: true } }, { is_deleted: { _eq: false } }] },
      { _or: [{ is_blocked: { _null: true } }, { is_blocked: { _eq: false } }] },
      { _or: [{ separation_date: { _null: true } }, { separation_date: { _gt: todayManila() } }] },
      ...q.split(/\s+/).filter(Boolean).map(word => ({
        _or: [
          ...["user_fname", "user_mname", "user_lname"].map(field => ({ [field]: { _icontains: word } })),
          ...(/^[1-9]\d{0,9}$/.test(word) ? [{ user_id: { _eq: Number(word) } }] : []),
        ],
      })),
    ],
  };
  const matches = await rows("user", employeeChoiceRow, choiceFields, filter, { limit: limit + 1, offset: (page - 1) * limit, sort: "user_lname,user_fname,user_id" });
  const employees = matches.slice(0, limit);
  const names = await getDepartments(employees);
  return { items: employees.map(row => employeeChoice(row, names)), hasMore: matches.length > limit };
}

function agencyChoice(record: Agency): AgencyChoice {
  return {
    id: record.id, shortCode: record.shortCode, name: record.fullName, agencyType: record.agencyType,
    programs: record.programs, payoutOptions: record.payoutOptions,
  };
}

export async function listRequestAgencies(params: URLSearchParams) {
  const { agencies, hasMore } = await listAgencies(new URLSearchParams({ status: "active", page: params.get("page") ?? "1" }));
  return { items: agencies.map(agencyChoice), hasMore };
}

async function activeAgency(id: number | null) {
  if (!id) return null;
  try {
    const record = await readAgency(id);
    return record.isActive ? agencyChoice(record) : null;
  } catch (error) {
    if (error instanceof AgencyError && error.status === 404) return null;
    throw error;
  }
}

async function activeEmployee(id: number | null, day: string) {
  if (!id) return null;
  const [employee] = await rows("user", employeeRow, employeeFields, { user_id: { _eq: id } }, { limit: 1 });
  if (!employee || !employee.is_employee || employee.is_deleted || employee.is_blocked ||
    (employee.separation_date && employee.separation_date <= day)) return null;
  return employee;
}

const decimal = z.union([z.number(), z.string()]).transform(String);
const wageRow = z.object({
  monthly_rate: decimal.nullable(), daily_wage: decimal.nullable(), working_days_per_month: decimal.nullable(),
  isRegularEmployee: z.union([flag, z.null()]).nullable(),
});
function monthlyPay(wage: z.infer<typeof wageRow>) {
  if (wage.monthly_rate && positiveMoney(wage.monthly_rate)) return wage.monthly_rate;
  const days = wage.working_days_per_month && positiveMoney(wage.working_days_per_month) ? cents(wage.working_days_per_month) : 2600n;
  if (!wage.daily_wage || !positiveMoney(wage.daily_wage)) return null;
  const adjusted = ((cents(wage.daily_wage) * days + 50n) / 100n).toString().padStart(3, "0");
  return adjusted.slice(0, -2) + "." + adjusted.slice(-2);
}

async function payrollWage(employeeId: number, day: string) {
  const [wage] = await rows("user_wage_management", wageRow, Object.keys(wageRow.shape).join(","), {
    user_id: { _eq: employeeId },
    _or: [{ cutoff_wage_date_update: { _null: true } }, { cutoff_wage_date_update: { _lte: day } }],
  }, { limit: 1, sort: "-cutoff_wage_date_update,-id" });
  return { pay: wage ? monthlyPay(wage) : null, regular: wage?.isRegularEmployee ?? null };
}

const payrollLoanRow = z.object({
  loan_id: positiveId, benefit_code: z.string(), loan_name: z.string().nullable(), reference_no: z.string().nullable(),
  amortization_amount: decimal.refine(positiveMoney), paid_installments: z.coerce.number().int().nonnegative(),
  terms_installments: z.coerce.number().int().positive(),
});
const agenciesByBenefit: Record<string, string> = { SSS: "SSS", PAGIBIG: "HDMF" };
const agencyCodeFor = (agency: AgencyChoice) => agency.shortCode === "PAGIBIG" ? "HDMF" : agency.shortCode;

async function employeeLoans(employeeId: number): Promise<PayrollLoan[]> {
  const loans: PayrollLoan[] = [];
  const limit = 50;
  for (let offset = 0; ; offset += limit) {
    const batch = await rows("benefit_loans", payrollLoanRow, Object.keys(payrollLoanRow.shape).join(","), {
      user_id: { _eq: employeeId }, status: { _eq: "ACTIVE" }, remaining_balance: { _gt: 0 },
      benefit_code: { _in: Object.keys(agenciesByBenefit) },
    }, { limit, offset, sort: "loan_id" });
    loans.push(...batch.map(loan => ({
      id: loan.loan_id, agencyCode: agenciesByBenefit[loan.benefit_code], program: loan.loan_name?.trim() || null,
      reference: loan.reference_no, amortization: loan.amortization_amount, paid: loan.paid_installments, installments: loan.terms_installments,
    })));
    if (batch.length < limit) return loans;
  }
}

export async function assessRequest(form: RequestForm): Promise<RequestAssessment> {
  const day = todayManila();
  const [employee, agency, coMaker] = await Promise.all([
    activeEmployee(form.employeeId, day),
    activeAgency(form.agencyId),
    form.coMakerId && form.coMakerId !== form.employeeId ? activeEmployee(form.coMakerId, day) : null,
  ]);
  const [names, statuses, loanSource, wage] = await Promise.all([
    getDepartments([employee, coMaker].filter(row => row !== null)),
    employee?.employment_status_id ? rows("employment_status", employmentStatus, "id,name", {
      id: { _eq: employee.employment_status_id },
    }, { limit: 1 }).catch(() => []) : [],
    employee && agency ? employeeLoans(employee.user_id).catch(() => null) : null,
    employee ? payrollWage(employee.user_id, day).catch(() => ({ pay: null, regular: null })) : { pay: null, regular: null },
  ]);
  const code = agency ? agencyCodeFor(agency) : null;
  const loanSourceVerified = Boolean(loanSource && agency?.agencyType === "GOVERNMENT" && code && Object.values(agenciesByBenefit).includes(code));
  const loans = loanSourceVerified ? loanSource!.filter(loan => loan.agencyCode === code) : [];
  const renewalValid = loans.some(loan => loan.id === form.renewalLoanId);
  const hasProgram = Boolean(agency?.programs.includes(form.program));
  const capacity = employee && agency && hasProgram ? requestCapacity({
    ...form, renewalLoanId: renewalValid ? form.renewalLoanId : null,
  }, wage.pay, loanSource ?? [], loanSourceVerified) : null;
  const checks: RequestCheck[] = [];
  if (employee && agency && hasProgram) {
    const relatedLoans = loans.filter(loan => form.applicationType !== "RENEWAL" || loan.id !== form.renewalLoanId);
    const sameProgram = relatedLoans.some(loan => loan.program?.toLowerCase() === form.program.toLowerCase());
    const unclassified = relatedLoans.some(loan => !loan.program || !agency.programs.some(program =>
      program.toLowerCase() === loan.program!.toLowerCase()));
    checks.push(
      { label: "Currently employed", result: employee.separation_date ? "review" : "pass",
        detail: employee.separation_date ? "Upcoming separation on " + employee.separation_date + "." : "Active employee." },
      { label: "Regular employment", result: wage.regular === true ? "pass" : "review",
        detail: wage.regular === null ? "Regular status could not be verified." : wage.regular ? "Regular employee." : "Review employment status with HR." },
      { label: "Active loan in the same program", result: loanSourceVerified && !sameProgram && !unclassified ? "pass" : "review",
        detail: sameProgram ? "The employee already has an active loan in this program." : !loanSourceVerified || unclassified ?
          "The current loan program could not be verified." : "No other active loan in this program." },
      { label: "Deductions within 40% of basic pay", result: capacity?.aboveGuide === false ? "pass" : "review",
        detail: capacity?.aboveGuide == null ? "Check the loan amounts and Payroll data." : capacity.aboveGuide ?
          "Estimated loan deductions exceed the 40% guide." : "Estimated loan deductions are within the guide." },
    );
  }
  const summary: EmployeeSummary | null = employee ? {
    ...employeeChoice(employee, names), position: employee.user_position, status: statuses[0]?.name ??
      (wage.regular === null ? null : wage.regular ? "Regular" : "Non-regular"), basicPay: wage.pay, hiredOn: employee.user_dateOfHire,
    separationOn: employee.separation_date, sssNumber: employee.user_sss, pagIbigNumber: employee.user_pagibig,
    phone: employee.user_contact, email: employee.user_email,
  } : null;
  return {
    employee: summary, agency, coMaker: coMaker ? employeeChoice(coMaker, names) : null, loans,
    renewalUnavailable: Boolean(employee && agency && !loanSourceVerified), capacity, checks,
    fieldErrors: {
      ...requiredFields(form, { employeeActive: Boolean(employee), agency, coMakerActive: Boolean(coMaker), renewalValid }),
      ...invalidDraftFields(form),
    },
  };
}
