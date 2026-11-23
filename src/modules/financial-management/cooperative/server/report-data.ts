import "server-only";

import { z } from "zod";
import type { ReportColumn, ReportNotice, ReportResult, ReportRow } from "../console/reports/types";
import { readDirectusPages } from "./directus";
import { amountToCents, signedCentsToAmount } from "./member-read";

export type ReportFilters = { q: string; department: string };
export type LoanReportFilters = ReportFilters & { product: number | null };

export function textMatch(q: string, fields: string[]) {
  return { _or: fields.map(field => ({ [field]: { _icontains: q } })) };
}

export async function reportDepartments(collection: "cooperative_memberships" | "cooperative_loans" | "cooperative_clearances") {
  const field = collection === "cooperative_clearances" ? "membership_id.department_name" : "department_name";
  const department = z.object({ department_name: z.string().nullable() });
  const schema = collection === "cooperative_clearances" ? z.object({ membership_id: department }) : department;
  const rows = await readDirectusPages(collection, schema, {
    fields: field, sort: "id", ...(collection === "cooperative_clearances" ? { filter: JSON.stringify({ status: { _eq: "DRAFT" } }) } : {}),
  });
  return departmentsOf(rows.map(row => "membership_id" in row ? row.membership_id.department_name : row.department_name));
}

export function departmentsOf(names: Array<string | null>) {
  return [...new Set(names.filter((name): name is string => Boolean(name)))].sort((a, b) => a.localeCompare(b, "en-PH"));
}

export function reportProducts() {
  return readDirectusPages("cooperative_loan_products", z.object({ id: z.coerce.number().int().positive(), name: z.string() }), {
    fields: "id,name", sort: "name,id",
  });
}

export function reportTotals(columns: ReportColumn[], rows: ReportRow[]) {
  return columns.map((column, index) => {
    if (index === 0) return "Total";
    if (column.kind !== "money") return null;
    return signedCentsToAmount(rows.reduce((sum, row) => sum + amountToCents(String(row.cells[index] ?? "0")), 0n));
  });
}

export function blockedReport(columns: ReportColumn[], notice: ReportNotice): ReportResult {
  return { columns, departments: [], metadata: [], rows: [], totals: [], notices: [notice], blocked: true };
}
