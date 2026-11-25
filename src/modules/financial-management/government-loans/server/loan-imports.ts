import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { defaultEnrollmentColumns, enrollmentCsvHeaders, enrollmentCsvMaxBytes, enrollmentMappingError, readEnrollmentCsv } from "../enrollment/import-csv";
import type { EnrollmentImportBatch, EnrollmentImportHistory, EnrollmentImportPreview, EnrollmentImportRow } from "../enrollment/import-types";
import { matchPayrollEnrollment, sameProgram } from "../enrollment/payroll-match";
import { normalizedReference, unusualReference } from "../enrollment/rules";
import type { EnrollmentSnapshot, EnrollmentTerms } from "../enrollment/types";
import { cents } from "../requests/request-rules";
import type { Page } from "../requests/types";
import type { AgencyActor } from "./agencies";
import { GOVERNMENT_LOAN_IMPORT_BATCHES, GOVERNMENT_LOAN_REQUESTS, GovernmentLoansDirectusError, writeGovernmentLoansItem } from "./directus";
import {
  enrollmentBenefitCode, readActivePayrollPrograms, readEnrollmentRows, readImportAgencies, readImportEmployees,
  readLinkedPayrollLoans, readPayrollReferences, readReservedReferences,
} from "./enrollment-sources";
import { enrollmentState, enrollmentTerms, readOpenMonth, standaloneEnrollmentValues } from "./loan-enrollment";
import { isoDateTime, loanCommand, requestRevisionValues } from "./loan-requests";
import { employeeName } from "./request-assessment";
import { LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const checksum = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const importColumns = z.array(z.number().int().min(-1)).length(enrollmentCsvHeaders.length);

async function readUpload(request: Request) {
  if (Number(request.headers.get("content-length")) > enrollmentCsvMaxBytes + 16_384) {
    throw new LoanRequestError(413, "Choose a CSV file of 1 MB or less.");
  }
  const data = await request.formData().catch(() => null);
  const file = data?.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) throw new LoanRequestError(422, "Choose a CSV file.");
  if (file.size > enrollmentCsvMaxBytes) throw new LoanRequestError(413, "Choose a CSV file of 1 MB or less.");
  const bytes = Buffer.from(await file.arrayBuffer());
  let csv: ReturnType<typeof readEnrollmentCsv>;
  try {
    csv = readEnrollmentCsv(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new LoanRequestError(422, error instanceof TypeError ? "Save the CSV using UTF-8 encoding." :
      error instanceof Error ? error.message : "The CSV could not be read.");
  }
  const input = data?.get("columns");
  let columns = defaultEnrollmentColumns(csv.headers);
  if (typeof input === "string") {
    try { columns = importColumns.parse(JSON.parse(input)); }
    catch { throw new LoanRequestError(422, "Choose valid CSV column mappings."); }
  }
  return {
    ...csv, columns, fileHash: checksum(bytes), filename: file.name.split(/[/\\]/).at(-1)!.slice(0, 255),
    previewToken: data?.get("previewToken"),
  };
}
type Upload = Awaited<ReturnType<typeof readUpload>>;
type Candidate = EnrollmentTerms & { program: string; employee: { id: number; name: string }; agency: { id: number; name: string } };
type ReadyRow = { row: EnrollmentImportRow; candidate: Candidate; pending: boolean; payrollWarnings: string[] };

const zeroTotals = { ready: 0, skipped: 0, warnings: 0, monthlyAmortization: "0.00" };
const whole = (value: string) => /^\d+$/.test(value) ? Number(value) : NaN;
const termLabels: Partial<Record<keyof EnrollmentTerms, string>> = {
  agencyReference: "Loan reference", originalPrincipal: "Loan amount", monthlyAmortization: "Monthly amortization",
  installmentCount: "Number of amortizations", installmentsPaid: "Amortizations already paid", firstDeductionMonth: "First deduction month",
};

async function validateImport(upload: Upload): Promise<{ preview: EnrollmentImportPreview; ready: ReadyRow[] }> {
  const openMonth = await readOpenMonth();
  if (!openMonth) throw new LoanRequestError(503, "Set the Government Loans open month before importing.");
  const { headers, columns } = upload;
  const mappingError = enrollmentMappingError(columns, headers.length);
  const base = { headers, columns, openMonth, mappingError };
  if (mappingError) return { preview: { ...base, token: null, rows: [], totals: zeroTotals }, ready: [] };
  const seen = new Map<string, number>();
  const inputs = upload.rows.map(({ rowNumber, cells }) => {
    const [employee, agency, program, reference, principal, amortization, installments, paid, month] =
      columns.map(index => (cells[index] ?? "").trim());
    const row: EnrollmentImportRow = {
      rowNumber, employee: employee.slice(0, 120), agency: agency.toUpperCase().slice(0, 80), program: program.slice(0, 160),
      reference: reference.slice(0, 120), amortization: amortization.slice(0, 32), installments: installments.slice(0, 16),
      paid: (paid || "0").slice(0, 16), month: month.slice(0, 16), payrollLoanId: null, errors: [], warnings: [],
    };
    const id = positiveId.safeParse(whole(employee));
    if (!id.success) row.errors.push("Enter a valid VOS employee ID.");
    if (cells.length !== headers.length) row.errors.push("This row has a different number of columns from the header.");
    if (agency.length > 80 || !agency) row.errors.push("Enter a valid agency code.");
    if (program.length > 160 || !program) row.errors.push("Enter a valid loan program.");
    const key = normalizedReference(reference);
    const first = seen.get(key);
    if (first !== undefined) row.errors.push("Duplicate loan reference. First used on row " + first + ".");
    else if (key) seen.set(key, rowNumber);
    const terms = enrollmentTerms.safeParse({
      agencyReference: reference, originalPrincipal: principal, monthlyAmortization: amortization,
      installmentCount: whole(installments), installmentsPaid: whole(paid || "0"),
      firstDeductionMonth: month, referenceConfirmed: false, priorLoanId: null,
    });
    if (!terms.success) {
      for (const issue of terms.error.issues) row.errors.push("Check " + (termLabels[issue.path[0] as keyof EnrollmentTerms] ?? "the loan terms") + ".");
    } else {
      if (terms.data.installmentsPaid >= terms.data.installmentCount) row.errors.push("Amortizations already paid must be below the total.");
      if (month < openMonth) row.errors.push("The deduction month is closed. Choose " + openMonth + " or later.");
    }
    return { row, key, employeeId: id.success ? id.data : null, terms: terms.success ? terms.data : null };
  });
  const eligible = inputs.filter(item => !item.row.errors.length);
  const [employeeRows, agencyRows] = await Promise.all([
    readImportEmployees(eligible.flatMap(item => item.employeeId ? [item.employeeId] : [])),
    readImportAgencies(eligible.map(item => item.row.agency)),
  ]);
  const employees = new Map(employeeRows.map(row => [row.user_id, row]));
  const agencies = new Map(agencyRows.map(row => [row.shortCode, row]));
  const day = todayManila();
  const candidates = eligible.flatMap(({ row, key, employeeId, terms }) => {
    const employee = employeeId ? employees.get(employeeId) : undefined;
    const agency = agencies.get(row.agency);
    if (!employee || !employee.is_employee || employee.is_deleted || employee.is_blocked ||
        employee.separation_date && employee.separation_date <= day) row.errors.push("Employee ID does not identify an active VOS employee.");
    if (!agency?.active) row.errors.push("Choose an active agency code from Remittances.");
    else if (!agency.programs.includes(row.program)) row.errors.push("The program is unavailable for this agency.");
    if (row.errors.length || !employee || !agency || !terms) return [];
    row.employee = employeeName(employee);
    if (employee.separation_date) row.warnings.push("Employee is separating on " + employee.separation_date + ".");
    if (unusualReference(agency.shortCode, terms.agencyReference)) row.warnings.push("Unusual agency reference format.");
    if (100n * cents(terms.monthlyAmortization) * BigInt(terms.installmentCount) < 95n * cents(terms.originalPrincipal)) {
      row.warnings.push("Scheduled amortization is below 95% of the loan amount.");
    }
    return [{ row, key, terms, employeeId: employee.user_id, agency, code: enrollmentBenefitCode(agency) }];
  });
  const references = candidates.map(item => item.key);
  const [reserved, payroll, active] = await Promise.all([
    readReservedReferences(references), readPayrollReferences(references),
    readActivePayrollPrograms(candidates.flatMap(item => item.code ? [item.employeeId] : [])),
  ]);
  const reservedKeys = new Set(reserved.map(row => row.live_reference_key && normalizedReference(row.live_reference_key)));
  const matches = candidates.map(item => ({
    ...item, match: matchPayrollEnrollment(payroll.get(item.key) ?? [], {
      ...item.terms, employeeId: item.employeeId, program: item.row.program,
    }, item.code, true),
  }));
  const linked = new Set((await readLinkedPayrollLoans(matches.flatMap(item => item.match.loanId ? [item.match.loanId] : [])))
    .map(row => row.payroll_loan_id));
  const ready = matches.flatMap(({ row, key, terms, employeeId, agency, code, match }): ReadyRow[] => {
    if (reservedKeys.has(key)) row.errors.push("The reference is already reserved by a VOS loan.");
    if (match.conflict) row.errors.push(match.conflict);
    if (match.loanId && linked.has(match.loanId)) row.errors.push("This Payroll loan is already linked to a VOS enrollment.");
    if (row.errors.length) return [];
    if (!code) row.warnings.push("External reference check pending.");
    if (active.some(loan => loan.loan_id !== match.loanId && loan.user_id === employeeId && loan.benefit_code === code &&
      sameProgram(loan.loan_name, row.program))) row.warnings.push("Employee already has another active loan in this program.");
    row.payrollLoanId = match.loanId;
    row.warnings.push(...match.warnings);
    return [{
      row, pending: !code, payrollWarnings: match.warnings,
      candidate: { ...terms, referenceConfirmed: unusualReference(agency.shortCode, terms.agencyReference),
        program: row.program, employee: { id: employeeId, name: row.employee }, agency: { id: agency.id, name: agency.name } },
    }];
  });
  const rows = inputs.map(input => input.row);
  const total = ready.reduce((sum, item) => sum + cents(item.candidate.monthlyAmortization), 0n).toString().padStart(3, "0");
  const totals = {
    ready: ready.length, skipped: rows.length - ready.length,
    warnings: ready.filter(item => item.row.warnings.length).length,
    monthlyAmortization: total.slice(0, -2) + "." + total.slice(-2),
  };
  const token = checksum(JSON.stringify([upload.fileHash, columns, openMonth, rows, ready]));
  return { preview: { ...base, token, rows, totals }, ready };
}

export async function previewLoanImport(request: Request) {
  return (await validateImport(await readUpload(request))).preview;
}

const count = z.number().int().nonnegative();
const batchRow = z.object({
  id: positiveId, filename: z.string(), actor_name: z.string(), created_at: z.string(), open_month: z.string(),
  ready_count: count, skipped_count: count, warning_count: count, monthly_amortization: z.string(),
});
const batchFields = Object.keys(batchRow.shape).join(",");
const batchReceipt = batchRow.pick({ id: true }).extend({ actor_user_id: positiveId, request_hash: hash });
const batchDetails = batchRow.extend({ row_results: z.custom<EnrollmentImportRow[]>() });
const batchSummary = (row: z.output<typeof batchRow>): EnrollmentImportBatch => ({
  id: row.id, filename: row.filename, actorName: row.actor_name, createdAt: isoDateTime(row.created_at), openMonth: row.open_month,
  totals: { ready: row.ready_count, skipped: row.skipped_count, warnings: row.warning_count, monthlyAmortization: row.monthly_amortization },
});

export async function listLoanImports(params: URLSearchParams): Promise<Page<EnrollmentImportBatch>> {
  const page = parseInput(pageNumber, params.get("page") ?? "1");
  const limit = 25;
  const result = await readEnrollmentRows(GOVERNMENT_LOAN_IMPORT_BATCHES, batchRow, batchFields, {}, limit + 1, "-created_at,-id", (page - 1) * limit);
  return { items: result.slice(0, limit).map(batchSummary), hasMore: result.length > limit };
}

export async function getLoanImport(id: number): Promise<EnrollmentImportHistory> {
  const [row] = await readEnrollmentRows(GOVERNMENT_LOAN_IMPORT_BATCHES, batchDetails, batchFields + ",row_results", { id: { _eq: id } }, 1);
  if (!row) throw new LoanRequestError(404, "Import batch could not be found.");
  const entry = z.object({ id: positiveId, enrollment: z.object({ sourceRow: z.number().int().positive() }) });
  const loans: EnrollmentImportHistory["loans"] = [];
  for (let offset = 0; offset < row.ready_count; offset += 50) {
    const results = await readEnrollmentRows(GOVERNMENT_LOAN_REQUESTS, entry, "id,enrollment", { import_batch_id: { _eq: id } }, 50, "id", offset);
    loans.push(...results.map(result => ({ id: result.id, rowNumber: result.enrollment.sourceRow })));
  }
  return { ...batchSummary(row), rows: row.row_results, loans };
}

async function importReceipt(command: ReturnType<typeof loanCommand>) {
  const [record] = await readEnrollmentRows(GOVERNMENT_LOAN_IMPORT_BATCHES, batchReceipt, Object.keys(batchReceipt.shape).join(","),
    { command_key: { _eq: command.key } }, 1);
  if (!record) return null;
  if (record.actor_user_id !== command.actor.actorId || record.request_hash !== command.hash) {
    throw new LoanRequestError(409, "This import key was already used for a different submission.");
  }
  return { id: record.id };
}

function importChildKey(key: string, row: number) {
  const value = checksum(key + ":existing-loan:" + row);
  return value.slice(0, 8) + "-" + value.slice(8, 12) + "-8" + value.slice(13, 16) + "-a" + value.slice(17, 20) + "-" + value.slice(20, 32);
}

export async function commitLoanImport(request: Request, actor: AgencyActor) {
  const upload = await readUpload(request);
  const supplied = hash.safeParse(upload.previewToken);
  if (!supplied.success) throw new LoanRequestError(422, "Check the rows before importing.");
  const command = loanCommand(request.headers.get("Idempotency-Key"), {
    operation: "import-existing-loans", filename: upload.filename, fileHash: upload.fileHash, columns: upload.columns, preview: supplied.data,
  }, actor);
  const replay = await importReceipt(command);
  if (replay) return replay;
  const { preview, ready } = await validateImport(upload);
  if (preview.token !== supplied.data) {
    const replay = await importReceipt(command);
    if (replay) return replay;
    return Response.json({ message: "The import results changed. Review the updated rows and confirm again.", preview }, { status: 409 });
  }
  if (!ready.length) throw new LoanRequestError(422, "No valid rows to import.");

  const now = new Date().toISOString();
  const loans = ready.map(({ row, candidate, pending, payrollWarnings }) => {
    const { employee, agency, program, ...terms } = candidate;
    const enrollment: EnrollmentSnapshot = {
      ...terms, origin: "IMPORT", externalReferenceCheck: pending ? "NEEDS_SOURCE" : "VERIFIED",
      encodedBy: { id: actor.actorId, name: actor.actorName }, encodedAt: now, sourceRow: row.rowNumber,
      payrollLoanId: row.payrollLoanId, payrollWarnings,
    };
    const child = loanCommand(importChildKey(command.key, row.rowNumber), { batch: command.key, sourceRow: row.rowNumber }, actor);
    return requestRevisionValues(child, "REQUEST_ENROLLED", null, {
      ...standaloneEnrollmentValues(employee, agency, program, actor, now), ...enrollmentState(enrollment),
    }, null, { status: "ENROLLED", enrollment, sourceRow: row.rowNumber, warnings: row.warnings }, now);
  });
  const totals = preview.totals;
  try {
    const { data } = z.object({ data: z.object({ id: positiveId }) }).parse(
      await writeGovernmentLoansItem(GOVERNMENT_LOAN_IMPORT_BATCHES, {
        filename: upload.filename, file_hash: upload.fileHash, actor_user_id: actor.actorId, actor_name: actor.actorName, actor_role: actor.actorRole,
        created_at: now, open_month: preview.openMonth, command_key: command.key, request_hash: command.hash,
        ready_count: totals.ready, skipped_count: totals.skipped, warning_count: totals.warnings, monthly_amortization: totals.monthlyAmortization,
        row_results: preview.rows, enrollments: { create: loans },
      }, "id", undefined, 45_000),
    );
    return data;
  } catch (error) {
    const replay = await importReceipt(command);
    if (replay) return replay;
    if (error instanceof GovernmentLoansDirectusError && error.code === "RECORD_NOT_UNIQUE") {
      return Response.json({ message: "The batch conflicts with another save. Review the refreshed results.", preview: (await validateImport(upload)).preview },
        { status: 409 });
    }
    throw error;
  }
}
