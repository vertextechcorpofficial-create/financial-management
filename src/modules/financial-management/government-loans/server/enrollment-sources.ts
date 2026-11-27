import "server-only";

import { z } from "zod";
import type { AgencyChoice } from "../requests/types";
import { normalizedReference } from "../enrollment/rules";
import { payrollBenefitCodes } from "./agencies";
import { GOVERNMENT_LOAN_AGENCIES, GOVERNMENT_LOAN_REQUESTS, readGovernmentLoansItems, type GovernmentLoansCollection } from "./directus";
import { mapLimit } from "./concurrency";
import { flag, LoanRequestError, positiveId } from "./request-input";

export async function readEnrollmentRows<T>(collection: GovernmentLoansCollection, schema: z.ZodType<T>, fields: string, filter: object,
  limit: number, sort?: string, offset?: number) {
  const query = new URLSearchParams({
    fields, filter: JSON.stringify(filter), limit: String(limit), ...(sort ? { sort } : {}),
    ...(offset !== undefined ? { offset: String(offset) } : {}),
  });
  return z.object({ data: z.array(schema).max(limit) }).parse(await readGovernmentLoansItems(collection, query)).data;
}

// Keep lookup URL lengths and concurrency bounded even for a full import.
function valueGroups<T extends string | number>(values: T[]) {
  const result: T[][] = [];
  let group: T[] = [];
  let size = 0;
  for (const value of new Set(values)) {
    const added = encodeURIComponent(value).length + 70;
    if (size + added > 3600 || group.length === 25) {
      result.push(group);
      group = [];
      size = 0;
    }
    group.push(value);
    size += added;
  }
  if (group.length) result.push(group);
  return result;
}

export async function readGroups<T, K extends string | number>(collection: GovernmentLoansCollection, schema: z.ZodObject<z.ZodRawShape>,
  keys: K[], filter: (group: K[]) => object, sort: string) {
  const found = new Map<unknown, T>();
  const fields = Object.keys(schema.shape).join(",");
  const limit = 100;
  const groups = await mapLimit(valueGroups(keys), 4, async group => {
    const rows: T[] = [];
    for (let offset = 0; ; offset += limit) {
      const items = await readEnrollmentRows(collection, schema, fields, filter(group), limit, sort, offset);
      rows.push(...(items as T[]));
      if (items.length < limit) return rows;
    }
  });
  for (const rows of groups) for (const item of rows) found.set(item[sort as keyof T], item);
  return [...found.values()];
}

export const enrollmentBenefitCode = (agency: Pick<AgencyChoice, "agencyType" | "shortCode">) =>
  agency.agencyType === "GOVERNMENT" ? payrollBenefitCodes.get(agency.shortCode) : undefined;

const mappedCodes = [...new Set(payrollBenefitCodes.values())];
const decimalText = z.union([z.string(), z.number()]).nullable().transform(value => value === null ? null : String(value));
const payrollRow = z.object({
  loan_id: positiveId, user_id: positiveId, benefit_code: z.string(), status: z.string().nullable(),
  loan_name: z.string().nullable(), reference_no: z.string().nullable(),
  principal_amount: decimalText, amortization_amount: decimalText, terms_installments: decimalText, paid_installments: decimalText,
});
type PayrollRow = z.output<typeof payrollRow>;

export async function readPayrollReferences(references: string[]) {
  try {
    const records = await readGroups<PayrollRow, string>("benefit_loans", payrollRow, references, group => ({
      benefit_code: { _in: mappedCodes },
      _and: [
        { _or: [{ status: { _nin: ["CLOSED", "CANCELLED"] } }, { status: { _null: true } }] },
        { _or: group.map(reference => ({ reference_no: { _icontains: reference } })) },
      ],
    }), "loan_id");
    const result = new Map<string, PayrollRow[]>();
    for (const record of records) {
      if (!record.reference_no) continue;
      const key = normalizedReference(record.reference_no);
      const same = result.get(key) ?? [];
      same.push(record);
      result.set(key, same);
    }
    return result;
  } catch {
    throw new LoanRequestError(503, "Could not check live Payroll references. Try again.");
  }
}

const activeLoan = payrollRow.pick({ loan_id: true, user_id: true, benefit_code: true, loan_name: true });
export async function readActivePayrollPrograms(employees: number[]) {
  try {
    return await readGroups<z.output<typeof activeLoan>, number>("benefit_loans", activeLoan, employees, group => ({
      benefit_code: { _in: mappedCodes }, user_id: { _in: group }, status: { _eq: "ACTIVE" }, remaining_balance: { _gt: 0 },
    }), "loan_id");
  } catch {
    throw new LoanRequestError(503, "Could not check active Payroll loans. Try again.");
  }
}

const referenceRow = z.object({ id: positiveId, live_reference_key: z.string().nullable(), payroll_loan_id: positiveId.nullable() });
type ReservedReference = z.output<typeof referenceRow>;
export function readReservedReferences(references: string[]) {
  return readGroups<ReservedReference, string>(GOVERNMENT_LOAN_REQUESTS, referenceRow, references,
    group => ({ live_reference_key: { _in: group } }), "id");
}

export function readLinkedPayrollLoans(ids: number[]) {
  return readGroups<ReservedReference, number>(GOVERNMENT_LOAN_REQUESTS, referenceRow, ids,
    group => ({ payroll_loan_id: { _in: group } }), "id");
}

const employeeRow = z.object({
  user_id: positiveId, user_fname: z.string().nullable(), user_mname: z.string().nullable(), user_lname: z.string().nullable(),
  is_employee: flag, is_deleted: flag, is_blocked: flag, separation_date: z.iso.date().nullable(),
});
export type ImportEmployee = z.output<typeof employeeRow>;
export const readImportEmployees = (ids: number[]) => readGroups<ImportEmployee, number>("user", employeeRow, ids,
  group => ({ user_id: { _in: group } }), "user_id");

const agencyRow = z.object({
  id: positiveId, short_code: z.string(), full_name: z.string(), agency_type: z.enum(["GOVERNMENT", "BANK", "OTHER"]),
  is_active: flag, programs: z.string(),
});
export async function readImportAgencies(codes: string[]) {
  const rows = await readGroups<z.output<typeof agencyRow>, string>(GOVERNMENT_LOAN_AGENCIES, agencyRow, codes,
    group => ({ short_code: { _in: group } }), "id");
  return rows.map(row => ({
    id: row.id, shortCode: row.short_code, name: row.full_name, agencyType: row.agency_type, active: row.is_active,
    programs: row.programs.split(",").map(value => value.trim()).filter(Boolean),
  }));
}
