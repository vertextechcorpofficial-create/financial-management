import "server-only";

import { z } from "zod";
import { reportRecordTypes, type ReportNotice, type ReportResult } from "../console/reports/types";
import { readClearanceDocumentCompliance } from "./clearance-store";
import { CooperativeDirectusError, readDirectusPages } from "./directus";
import { readLoanDocumentStatuses } from "./loans";
import { departmentsOf, reportDepartments, textMatch, type ReportFilters } from "./report-data";

type RecordType = keyof typeof reportRecordTypes;
export type ComplianceSource = {
  departments: string[];
  records: Array<{
    id: number;
    reference: string | null;
    name: string;
    department: string | null;
    required: number;
    onFile: number;
    missing: string[];
  }>;
};
const id = z.coerce.number().int().positive();
const loan = z.object({
  id, loan_no: z.string(), member_name: z.string(), department_name: z.string().nullable(), terms_snapshot: z.unknown(),
});
const clearance = z.object({
  id, clearance_no: z.string(),
  membership_id: z.object({ employee_name: z.string(), department_name: z.string().nullable() }),
});

async function loanCompliance(filters: ReportFilters): Promise<ComplianceSource> {
  const [loans, departments] = await Promise.all([
    readDirectusPages("cooperative_loans", loan, {
      fields: Object.keys(loan.shape).join(","),
      filter: JSON.stringify({
        status: { _in: ["PENDING", "APPROVED", "ACTIVE"] },
        ...(filters.q ? textMatch(filters.q, ["loan_no", "agreement_no", "member_name", "member_no"]) : {}),
        ...(filters.department ? { department_name: { _eq: filters.department } } : {}),
      }),
    }),
    reportDepartments("cooperative_loans"),
  ]);
  const statuses = await readLoanDocumentStatuses(loans);
  return {
    departments, records: loans.map(row => {
      const { required, done, missing } = statuses.get(row.id)!;
      return {
        id: row.id, reference: row.loan_no, name: row.member_name, department: row.department_name,
        required: new Set(required.map(rule => rule.documentTypeId)).size,
        onFile: new Set(done.map(rule => rule.documentTypeId)).size,
        missing: [...new Map(missing.map(rule => [rule.documentTypeId, rule.name])).values()],
      };
    }),
  };
}

async function clearanceCompliance(filters: ReportFilters): Promise<ComplianceSource> {
  const contains = { _icontains: filters.q };
  const person = /^[1-9]\d{0,9}$/.test(filters.q) ? [{ membership_id: { user_id: { _eq: Number(filters.q) } } }] : [];
  const [clearances, departments] = await Promise.all([
    readDirectusPages("cooperative_clearances", clearance, {
      fields: "id,clearance_no,membership_id.employee_name,membership_id.department_name",
      filter: JSON.stringify({
        status: { _eq: "DRAFT" },
        ...(filters.q ? { _or: [{ clearance_no: contains }, { membership_id: { employee_name: contains } }, ...person] } : {}),
        ...(filters.department ? { membership_id: { department_name: { _eq: filters.department } } } : {}),
      }),
    }),
    reportDepartments("cooperative_clearances"),
  ]);
  const statuses = clearances.length ? (await readClearanceDocumentCompliance(clearances.map(row => row.id))).cases : new Map();
  return {
    departments, records: clearances.map(row => {
      const status = statuses.get(row.id)!;
      return {
        id: row.id, reference: row.clearance_no, name: row.membership_id.employee_name,
        department: row.membership_id.department_name, required: status.required, onFile: status.onFile,
        missing: [...status.warnings, ...status.blocks],
      };
    }),
  };
}

export async function getDocumentReport(
  filters: ReportFilters, recordType: RecordType | "", membershipCompliance: () => Promise<ComplianceSource>,
): Promise<ReportResult> {
  const readers = {
    membership: membershipCompliance,
    loan: () => loanCompliance(filters),
    clearance: () => clearanceCompliance(filters),
  };
  const sources = recordType ? [recordType] : Object.keys(reportRecordTypes) as RecordType[];
  const results = await Promise.allSettled(sources.map(source => readers[source]()));
  const notices: ReportNotice[] = [];
  const rows: ReportResult["rows"] = [];
  const departments: string[] = [];
  let missing = 0;
  let ready = false;
  for (const [index, result] of results.entries()) {
    const source = sources[index];
    const label = reportRecordTypes[source];
    if (result.status === "rejected") {
      const pending = result.reason instanceof CooperativeDirectusError && result.reason.status === 404;
      notices.push({ label, state: pending ? "pending_rollout" : "unavailable",
        message: pending ? "Document checks are awaiting this source." : "Document requirements could not be checked." });
      continue;
    }
    ready = true;
    departments.push(...result.value.departments);
    for (const row of result.value.records) {
      if (!row.missing.length) continue;
      missing += row.missing.length;
      rows.push({ id: source + ":" + row.id, cells: [
        label, row.reference, row.name, row.department, row.onFile + " of " + row.required, row.missing.join(", "),
      ] });
    }
  }
  return {
    columns: ["Record type", "Reference", "Member", "Department", "On file", "Missing documents"].map(label => ({ label })),
    rows, metadata: [], departments: departmentsOf(departments), notices, blocked: !ready,
    totals: ready ? [rows.length + " affected records", null, null, null, null, missing + " missing"] : [],
  };
}
