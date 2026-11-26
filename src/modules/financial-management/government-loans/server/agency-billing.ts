import "server-only";

import type { AgencyActor } from "./agencies";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { normalizedReference } from "../enrollment/rules";
import { deductionCatchUp, expectedDeduction, monthAfter } from "../loans/monthly-payroll";
import { amountFromCentavos } from "../loans/position";
import { billingMaxBytes, parseAgencyBill, type BillingLine } from "../remittances/billing/csv";
import { compareAgencyBilling, needsBillingReview, type BillingLoan } from "../remittances/billing/reconcile";
import { GOVERNMENT_LOAN_AGENCIES, GOVERNMENT_LOAN_BILLING_REVISIONS, GOVERNMENT_LOAN_REQUESTS,
  GovernmentLoansDirectusError, writeGovernmentLoansItem } from "./directus";
import { readEnrollmentRows, readGroups } from "./enrollment-sources";
import { readOpenMonth } from "./loan-enrollment";
import { readBillingLoanSchedules } from "./loan-register";
import { isoDateTime, referenceFor } from "./loan-requests";
import { payrollMoney, payrollMonth, readCurrentPayrollReceipt, readPayrollPages, readPayrollResults, receiptSummary, type PayrollReceipt } from "./payroll-month-store";
import { nextPeriodCommand } from "./period-commands";
import { flag, LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";

const contextInput = z.object({ agencyId: positiveId, month: payrollMonth });
const viewInput = contextInput.extend({ page: pageNumber, historyPage: pageNumber, issues: z.literal("1").optional() });
const importInput = contextInput.extend({ fileName: z.string().trim().min(1).max(255)
  .refine(name => /\.csv$/i.test(name) && !/[\\/\x00-\x1f\x7f]/.test(name)),
  csv: z.string().min(1).max(billingMaxBytes), columns: z.array(z.number().int()).length(3).optional() });
const confirmInput = importInput.extend({
  token: z.string().regex(/^[a-f0-9]{64}$/), reason: z.string().trim().max(500).default(""),
});
const lineSchema = z.object({ rowNumber: positiveId, reference: z.string(), name: z.string(), amount: payrollMoney });
const revisionSchema = z.object({
  id: z.uuid(), revision: positiveId, previous_id: z.uuid().nullable(), agency_id: positiveId, month: payrollMonth,
  source_hash: z.string(), request_hash: z.string(), command_key: z.uuid(), row_count: positiveId,
  file_name: z.string(), uploaded_by: z.string(), uploaded_by_id: positiveId, uploaded_at: z.string(), reason: z.string().nullable(),
});
const billSchema = revisionSchema.extend({ lines: z.array(lineSchema).max(5000) });
type Revision = z.output<typeof revisionSchema>;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const revisionFields = Object.keys(revisionSchema.shape).join(",");
const agencySchema = z.object({ id: positiveId, short_code: z.string(), display_name: z.string(), sends_billing: flag, catch_up: flag });
const agencyFields = Object.keys(agencySchema.shape).join(",");
const billingMonth = z.object({ agency_id: positiveId, month: payrollMonth });

const billingScope = (agencyId: number, month: string) => ({ agency_id: { _eq: agencyId }, month: { _eq: month } });
const pageSize = 25;

function billingRevision(row: Revision) {
  return { id: row.id, number: row.revision, previousId: row.previous_id, fileName: row.file_name, rowCount: row.row_count,
    uploadedBy: row.uploaded_by, uploadedAt: isoDateTime(row.uploaded_at), reason: row.reason };
}

async function getOpenMonth() {
  const month = await readOpenMonth();
  if (!month) throw new LoanRequestError(503, "Set the Government Loans open month before importing billing.");
  return month;
}

export async function getBillingContext() {
  const [openMonth, agencies, billingMonths] = await Promise.all([
    getOpenMonth(),
    readPayrollPages(GOVERNMENT_LOAN_AGENCIES, agencySchema, agencyFields, { sends_billing: { _eq: true } }, "display_name,short_code,id"),
    readPayrollPages(GOVERNMENT_LOAN_BILLING_REVISIONS, billingMonth, "agency_id,month", {}, "-month"),
  ]);
  const latestMonths: Record<string, string> = {};
  for (const row of billingMonths) latestMonths[String(row.agency_id)] ??= row.month;
  return { openMonth, latestMonths, agencies: agencies.map(row => ({ id: row.id, name: row.display_name, code: row.short_code })) };
}

async function getBillingAgency(id: number) {
  const [agency] = await readEnrollmentRows(GOVERNMENT_LOAN_AGENCIES, agencySchema, agencyFields, { id: { _eq: id } }, 1);
  if (!agency) throw new LoanRequestError(404, "Agency could not be found.");
  return agency;
}

async function latestBill(agencyId: number, month: string) {
  const [current] = await readEnrollmentRows(GOVERNMENT_LOAN_BILLING_REVISIONS, billSchema, revisionFields + ",lines",
    billingScope(agencyId, month), 1, "-revision,id");
  return current ?? null;
}

async function latestBillRevision(agencyId: number, month: string) {
  const [current] = await readEnrollmentRows(GOVERNMENT_LOAN_BILLING_REVISIONS, revisionSchema, revisionFields,
    billingScope(agencyId, month), 1, "-revision,id");
  return current ?? null;
}

const loanCandidate = z.object({
  id: positiveId, status: z.string(), live_reference_key: z.string().nullable(), employee_name: z.string().nullable(),
  requested_at: z.string().nullable(), enrollment: z.object({ agencyReference: z.string() }).nullable(),
});
type Candidate = z.output<typeof loanCandidate>;

async function readBillingCandidates(agencyId: number, references: string[], ids: number[]) {
  const result = new Map<number, Candidate>();
  // The live key is held by staged and verified enrollments. Posted results also identify their exact loan ID.
  for (const [field, values] of [["live_reference_key", references], ["id", ids]] as const) {
    const rows = await readGroups<Candidate, string | number>(GOVERNMENT_LOAN_REQUESTS, loanCandidate, values, group => ({
      agency_id: { _eq: agencyId }, [field]: { _in: group }, enrollment: { _nnull: true },
    }), "id");
    for (const row of rows) result.set(row.id, row);
  }
  return [...result.values()];
}

async function reconcile(agency: z.output<typeof agencySchema>, month: string, lines: BillingLine[] | null,
  receipt: PayrollReceipt | null) {
  const results = receipt
    ? await readPayrollResults({ receipt_id: { _eq: receipt.id }, agency_id: { _eq: agency.id } }) : null;
  if (!lines) return compareAgencyBilling(null, [], results);
  const references = [...new Set(lines.map(line => normalizedReference(line.reference)))];
  const ids = [...new Set((results ?? []).map(result => result.loanId))];
  const matches = await readBillingCandidates(agency.id, references, ids);
  const priorMonth = monthAfter(month, -1);
  const prior = receipt && agency.catch_up && results?.length ? await readCurrentPayrollReceipt(priorMonth) : null;
  const [schedules, priorResults] = await Promise.all([
    receipt ? [] : readBillingLoanSchedules(month, agency.id, matches.filter(loan => loan.status === "ACTIVE").map(loan => loan.id)),
    prior ? readPayrollResults({ receipt_id: { _eq: prior.id }, agency_id: { _eq: agency.id },
      status: { _in: ["P", "F"] } }) : [],
  ]);
  const byId = new Map(schedules.map(loan => [loan.row.id, loan]));
  const priorById = new Map(priorResults.map(row => [row.loanId, row]));
  const resultIds = new Set(ids);
  const loans: BillingLoan[] = matches.map(row => {
    const projection = byId.get(row.id);
    const previous = priorById.get(row.id);
    const expected = projection ? expectedDeduction(projection.schedule, projection.history, month) : null;
    const previousResults = projection ? projection.history.filter(result => result.month >= projection.schedule.firstDeductionMonth)
      : previous ? [previous] : [];
    return { id: row.id, reference: row.enrollment?.agencyReference || row.live_reference_key || "",
      systemReference: row.requested_at ? referenceFor(row.id) : "GL-" + String(row.id).padStart(6, "0"),
      employee: row.employee_name, verified: row.status === "ACTIVE" || resultIds.has(row.id), expected,
      catchUp: amountFromCentavos(deductionCatchUp(agency.catch_up, previousResults, month)) };
  });
  return compareAgencyBilling(lines, loans, results);
}

export async function getAgencyBillingSummary(agencyId: number, month: string) {
  const [agency, bill, receipt] = await Promise.all([
    getBillingAgency(agencyId), latestBill(agencyId, month), readCurrentPayrollReceipt(month),
  ]);
  const comparison = await reconcile(agency, month, bill?.lines ?? null, receipt);
  return {
    agency, ...comparison, billingRevision: bill ? billingRevision(bill) : null,
    payrollReceipt: receipt ? receiptSummary(receipt) : null,
  };
}

export async function readSavedBillingComparison(agencyId: number, month: string, receipt: PayrollReceipt | null) {
  const bill = await latestBill(agencyId, month);
  if (!bill) return null;
  return reconcile(await getBillingAgency(agencyId), month, bill.lines, receipt);
}

export async function viewAgencyBilling(params: URLSearchParams) {
  if (!params.has("agencyId") && !params.has("month")) return getBillingContext();
  const { agencyId, month, page, historyPage, issues } = parseInput(viewInput, Object.fromEntries(params));
  const [openMonth, current, versions] = await Promise.all([
    getOpenMonth(), getAgencyBillingSummary(agencyId, month),
    readEnrollmentRows(GOVERNMENT_LOAN_BILLING_REVISIONS, revisionSchema, revisionFields, billingScope(agencyId, month),
      pageSize + 1, "-revision,id", (historyPage - 1) * pageSize),
  ]);
  const rows = issues ? current.rows.filter(needsBillingReview) : current.rows;
  return { ...current, month, openMonth, canImport: month === openMonth && current.agency.sends_billing, rowCount: rows.length,
    rows: rows.slice((page - 1) * pageSize, page * pageSize), hasMore: rows.length > page * pageSize,
    history: versions.slice(0, pageSize).map(billingRevision), historyHasMore: versions.length > pageSize };
}

function sourceFingerprint(input: z.output<typeof importInput>, columns: number[]) {
  return digest(JSON.stringify([digest(input.csv), columns]));
}

async function importState(agencyId: number, month: string) {
  if (month !== await getOpenMonth()) throw new LoanRequestError(409, "Billing can only be changed for the open Payroll month.");
  const guard = await nextPeriodCommand(month);
  const [agency, current, receipt] = await Promise.all([
    getBillingAgency(agencyId), latestBillRevision(agencyId, month), readCurrentPayrollReceipt(month),
  ]);
  if (!agency.sends_billing) throw new LoanRequestError(422, "Choose an agency configured to send billing.");
  return { guard, agency, current, receipt };
}

function previewToken(sourceHash: string, current: Revision | null,
  receipt: Awaited<ReturnType<typeof readCurrentPayrollReceipt>>, guard: Awaited<ReturnType<typeof nextPeriodCommand>>) {
  return digest(JSON.stringify([sourceHash, current?.id ?? null, receipt?.id ?? null, guard.revision_key]));
}

export async function previewAgencyBilling(body: unknown) {
  const input = parseInput(importInput, body);
  const parsed = parseAgencyBill(input.csv, input.columns);
  const state = await importState(input.agencyId, input.month);
  const sourceHash = sourceFingerprint(input, parsed.columns);
  const comparison = parsed.issueCount ? null : await reconcile(state.agency, input.month, parsed.lines, state.receipt);
  return {
    headers: parsed.headers, columns: parsed.columns, issues: parsed.issues, issueCount: parsed.issueCount,
    rowCount: parsed.lines.length, token: comparison ? previewToken(sourceHash, state.current, state.receipt, state.guard) : null,
    current: state.current ? billingRevision(state.current) : null, replay: state.current?.source_hash === sourceHash,
    preview: comparison ? { mode: comparison.mode, totals: comparison.totals, rows: comparison.rows.slice(0, 10) } : null,
  };
}

export async function confirmAgencyBilling(body: unknown, keyValue: string | null, actor: AgencyActor) {
  const input = parseInput(confirmInput, body);
  const key = parseInput(z.uuid(), keyValue);
  const { columns, lines, issueCount } = parseAgencyBill(input.csv, input.columns);
  if (issueCount) throw new LoanRequestError(422, "Resolve the CSV issues and preview the billing again.");
  const sourceHash = sourceFingerprint(input, columns);
  const requestHash = digest(JSON.stringify([actor.actorId, input.agencyId, input.month, input.fileName, sourceHash, input.token, input.reason]));
  const replay = async () => {
    const [existing] = await readEnrollmentRows(GOVERNMENT_LOAN_BILLING_REVISIONS, revisionSchema, revisionFields,
      { command_key: { _eq: key } }, 1);
    if (!existing) return null;
    if (existing.request_hash !== requestHash) throw new LoanRequestError(409, "This import key was already used.");
    return billingRevision(existing);
  };
  const already = await replay();
  if (already) return already;
  const { guard, current, receipt } = await importState(input.agencyId, input.month);
  if (current?.source_hash === sourceHash) return billingRevision(current);
  if (input.token !== previewToken(sourceHash, current, receipt, guard)) {
    throw new LoanRequestError(409, "Billing or Payroll changed. Review a fresh preview before confirming.");
  }
  if (current && !input.reason) throw new LoanRequestError(422, "Enter a reason for replacing the agency billing.");
  const row = {
    id: randomUUID(), revision: (current?.revision ?? 0) + 1, previous_id: current?.id ?? null, agency_id: input.agencyId,
    month: input.month, source_hash: sourceHash, request_hash: requestHash, command_key: key, row_count: lines.length,
    file_name: input.fileName, uploaded_by: actor.actorName, uploaded_by_id: actor.actorId,
    uploaded_at: new Date().toISOString(), reason: input.reason || null,
  };
  if (await getOpenMonth() !== input.month) throw new LoanRequestError(409, "The open Payroll month changed.");
  try {
    await writeGovernmentLoansItem(GOVERNMENT_LOAN_BILLING_REVISIONS, {
      ...row, lines, file_hash: digest(input.csv), column_map: columns,
      revision_key: row.agency_id + ":" + row.month + ":" + row.revision, period_command_id: guard,
    }, "id", undefined, 30_000);
    return billingRevision(row);
  } catch (error) {
    const committed = await replay();
    if (committed) return committed;
    if (error instanceof GovernmentLoansDirectusError && error.code === "RECORD_NOT_UNIQUE") {
      const latest = await latestBillRevision(input.agencyId, input.month);
      if (latest?.source_hash === sourceHash) return billingRevision(latest);
      throw new LoanRequestError(409, "Another action changed this Payroll month. Review a fresh preview.");
    }
    throw error;
  }
}

export async function readBillingImportBody(request: Request) {
  const maxBytes = billingMaxBytes * 2 + 8192;
  if (!request.body || Number(request.headers.get("Content-Length")) > maxBytes) {
    throw new LoanRequestError(413, "Choose a CSV up to 1 MB.");
  }
  let bytes = 0;
  const stream = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw new LoanRequestError(413, "Choose a CSV up to 1 MB.");
      controller.enqueue(chunk);
    },
  }));
  try {
    return await new Response(stream).json() as unknown;
  } catch (error) {
    if (error instanceof LoanRequestError) throw error;
    throw new LoanRequestError(400, "Could not read the billing import.");
  }
}
