import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { CooperativeDocumentError, readCooperativeUpload } from "@/modules/financial-management/cooperative/server/document-input";
import { uploadCooperativeAsset } from "@/modules/financial-management/cooperative/server/document-storage";
import { monthAfter, summarizeWithholding } from "../loans/monthly-payroll";
import { amountFromCentavos } from "../loans/position";
import { centavos } from "../payroll-handoff/contract";
import { maxRemittanceProofBytes, maxRemittanceSelection, remitKey, remittanceDeadline, remittancePenalty, remittanceStatus,
  remittanceStatuses, remittanceTotals } from "../remittances/preparation/rules";
import { listAgencies, readAgency, type AgencyActor } from "./agencies";
import { getAgencyBillingSummary } from "./agency-billing";
import { GOVERNMENT_LOAN_PAYROLL_RESULTS, GOVERNMENT_LOAN_REMITTANCE_BATCHES, GOVERNMENT_LOAN_REQUESTS,
  GovernmentLoansDirectusError, governmentLoansDirectus, writeGovernmentLoansItem } from "./directus";
import { readGroups } from "./enrollment-sources";
import { readOpenMonth } from "./loan-enrollment";
import { readCurrentPayrollReceipt, readLatestReceipts, readPayrollResultPage, readPayrollResults,
  readPayrollPages, payrollMoney, payrollMonth } from "./payroll-month-store";
import { nextPeriodCommand } from "./period-commands";
import { channelInput, latestRemittances, paymentDate, readRemittanceOverview, readSavedBatch, readSavedRemittance,
  remittanceBatchSummary } from "./remittance-records";
import { downloadLoanDocument, privateRequestFolder } from "./request-documents";
import { LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";

const pageSize = 25;
const monthQuery = z.object({
  month: payrollMonth.optional(), agencyId: positiveId.optional(), page: pageNumber,
  status: z.enum(Object.keys(remittanceStatuses) as [keyof typeof remittanceStatuses, ...(keyof typeof remittanceStatuses)[]]).optional(),
  action: z.literal("1").optional(), grouped: z.literal("1").optional(),
});
const rowRequest = z.object({ agencyId: positiveId, month: payrollMonth, reference: z.string().trim().max(200).default(""),
  penaltyOverride: payrollMoney.nullable().default(null) });
const batchRequest = z.object({
  paymentDate: paymentDate.nullable().default(null), channel: channelInput.nullable().default(null),
  items: z.array(rowRequest).min(1).max(maxRemittanceSelection)
    .refine(items => new Set(items.map(item => remitKey(item.agencyId, item.month))).size === items.length),
});
const confirmRequest = batchRequest.extend({ token: z.string().regex(/^[a-f0-9]{64}$/), paymentDate, channel: channelInput });
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const deductionFilter = (receiptId: string, agencyId: number) => ({
  receipt_id: { _eq: receiptId }, agency_id: { _eq: agencyId }, status: { _in: ["D", "P", "X"] },
});
const notReady = () => new LoanRequestError(409, "The selected agency-month is no longer available for preparation. Refresh the list.");

async function openMonth() {
  const configured = await readOpenMonth();
  if (!configured) throw new LoanRequestError(503, "Set the Government Loans open period before preparing remittances.");
  return configured;
}

async function readAgencies() {
  const result: Awaited<ReturnType<typeof listAgencies>>["agencies"] = [];
  for (let page = 1; ; page++) {
    const data = await listAgencies(new URLSearchParams({ page: String(page) }));
    result.push(...data.agencies);
    if (!data.hasMore) return result;
  }
}

export async function listRemittancePreparation(params: URLSearchParams) {
  const filters = parseInput(monthQuery, Object.fromEntries(params));
  const open = await openMonth();
  const today = todayManila();
  if (filters.month && filters.month > open) throw new LoanRequestError(422, "Choose the open Payroll month or an earlier month.");
  const months = filters.month ? [filters.month] : Array.from({ length: 6 }, (_, offset) => monthAfter(open, -offset));
  const [agencies, receipts, saved] = await Promise.all([
    readAgencies(), readLatestReceipts(months.at(-1)!, months[0]),
    readRemittanceOverview({ payroll_month: { _in: months }, ...(filters.agencyId ? { agency_id: { _eq: filters.agencyId } } : {}) }),
  ]);
  const byAgencyMonth = latestRemittances(saved);
  const byMonth = new Map<string, Map<number, bigint>>();
  const amountSchema = z.object({ agency_id: positiveId, amount: payrollMoney });
  for (const [month, receipt] of receipts) {
    const amounts = await readPayrollPages(GOVERNMENT_LOAN_PAYROLL_RESULTS, amountSchema, "agency_id,amount", {
      receipt_id: { _eq: receipt.id }, status: { _in: ["D", "P", "X"] },
      ...(filters.agencyId ? { agency_id: { _eq: filters.agencyId } } : {}),
    }, "id");
    const totals = new Map<number, bigint>();
    for (const row of amounts) totals.set(row.agency_id, (totals.get(row.agency_id) ?? 0n) + centavos(row.amount));
    byMonth.set(month, totals);
  }
  const items = agencies.filter(agency => !filters.agencyId || agency.id === filters.agencyId).flatMap(agency => months.flatMap(month => {
    const totals = byMonth.get(month);
    const withheld = totals ? amountFromCentavos(totals.get(agency.id) ?? 0n) : null;
    const key = remitKey(agency.id, month);
    const record = byAgencyMonth.get(key);
    if (!agency.isActive && !record && (withheld === null || withheld === "0.00")) return [];
    const live = record && record.state !== "RETURNED";
    const due = live ? record.due_date : remittanceDeadline(month, agency);
    const status = remittanceStatus(withheld, record?.state ?? null, today, due, agency.reminderDays, record?.payment_date);
    return [{ key, agencyId: agency.id, agency: agency.displayName, agencyCode: agency.shortCode, month, due, withheld,
      referenceLabel: agency.paymentReferenceLabel,
      policy: { deadlineRule: agency.deadlineRule, deadlineDay: agency.deadlineDay, penaltyBasis: agency.penaltyBasis,
        penaltyRatePercent: agency.penaltyRatePercent, reminderDays: agency.reminderDays },
      payment: record ? { id: record.id, paymentDate: record.payment_date, reference: record.payment_reference,
        penalty: record.entered_penalty, returnReason: record.return_reason } : null, ...status }];
  }));
  const counts = Object.fromEntries(Object.keys(remittanceStatuses).map(key => [key, 0])) as Record<keyof typeof remittanceStatuses, number>;
  for (const row of items) counts[row.status]++;
  const actionableRows = items.filter(row => row.status === "due" || row.status === "overdue" || row.status === "returned");
  const actionable = {
    count: actionableRows.length,
    withheld: remittanceTotals(actionableRows.map(row => ({ withheld: row.withheld ?? "0.00", penalty: null }))).withheld,
  };
  const filtered = items.filter(row => (!filters.action || row.status === "due" || row.status === "overdue" || row.status === "returned") &&
    (!filters.status || row.status === filters.status));
  const paged = filters.grouped ? filtered : filtered.slice((filters.page - 1) * pageSize, filters.page * pageSize);
  const usableAgencies = agencies.filter(agency => agency.isActive ||
    saved.some(row => row.agency_id === agency.id) || [...byMonth.values()].some(totals => (totals.get(agency.id) ?? 0n) > 0n));
  return { openMonth: open, businessDate: today, agencies: usableAgencies.map(agency => ({ id: agency.id, name: agency.displayName })),
    counts, actionable, items: paged, total: filtered.length, hasMore: !filters.grouped && filtered.length > filters.page * pageSize };
}

type BatchInput = z.output<typeof batchRequest>;

async function prepareRemittances(input: BatchInput) {
  const month = await openMonth();
  if (input.paymentDate && input.paymentDate.slice(0, 7) < month) {
    throw new LoanRequestError(422, "The payment date falls in a closed accounting period.");
  }
  if (input.items.some(row => row.month > month)) throw notReady();
  const periodCommand = await nextPeriodCommand(month);
  const agencies = [...new Set(input.items.map(row => row.agencyId))];
  const months = [...new Set(input.items.map(row => row.month))].sort();
  const policies = [];
  for (const id of agencies) policies.push(await readAgency(id));
  const [receipts, attempts] = await Promise.all([
    readLatestReceipts(months[0], months.at(-1)!),
    readRemittanceOverview({ agency_id: { _in: agencies }, payroll_month: { _in: months } }),
  ]);
  const byAgency = new Map(policies.map(row => [row.id, row]));
  const byAgencyMonth = latestRemittances(attempts);
  const rows = [];
  for (const selected of input.items) {
    const key = remitKey(selected.agencyId, selected.month);
    const record = byAgencyMonth.get(key);
    const receipt = receipts.get(selected.month);
    if (!receipt || record && (record.state !== "RETURNED" || record.live_key !== null)) throw notReady();
    const agency = byAgency.get(selected.agencyId)!;
    const [deductions, billing] = await Promise.all([
      readPayrollResults(deductionFilter(receipt.id, agency.id)),
      agency.sendsBilling ? getAgencyBillingSummary(agency.id, selected.month) : null,
    ]);
    if (billing && billing.payrollReceipt?.id !== receipt.id) throw notReady();
    const withheld = summarizeWithholding(deductions)[0]?.amount ?? "0.00";
    if (withheld === "0.00") throw notReady();
    const due = remittanceDeadline(selected.month, agency);
    const calculated = input.paymentDate ? remittancePenalty(withheld, input.paymentDate, due, agency) : null;
    if (agency.penaltyBasis === "NONE" && selected.penaltyOverride !== null && selected.penaltyOverride !== "0.00") {
      throw new LoanRequestError(422, "This agency's rule does not allow a penalty.");
    }
    const penalty = calculated ? selected.penaltyOverride ?? calculated.computedPenalty : null;
    if (!payrollMoney.safeParse(withheld).success || (penalty !== null && !payrollMoney.safeParse(penalty).success) ||
        (calculated && !payrollMoney.safeParse(calculated.computedPenalty).success)) {
      throw new LoanRequestError(422, "The withholding or penalty exceeds the supported amount.");
    }
    rows.push({
      key, agencyId: agency.id, agency: agency.displayName, agencyCode: agency.shortCode, month: selected.month,
      withheld, due, daysLate: calculated?.daysLate ?? null, computedPenalty: calculated?.computedPenalty ?? null, penalty,
      penaltyOverridden: calculated !== null && selected.penaltyOverride !== null && selected.penaltyOverride !== calculated.computedPenalty,
      reference: selected.reference, referenceLabel: agency.paymentReferenceLabel, priorId: record?.id ?? null,
      policy: { deadlineRule: agency.deadlineRule, deadlineDay: agency.deadlineDay, penaltyBasis: agency.penaltyBasis,
        penaltyRatePercent: agency.penaltyRatePercent, reminderDays: agency.reminderDays, revision: agency.revision },
      source: { receiptId: receipt.id, receiptRevision: receipt.revision,
        billingRevisionId: billing?.billingRevision?.id ?? null, billingRevision: billing?.billingRevision?.number ?? null,
        discrepancies: billing?.totals.discrepancies ?? 0, missingBilling: !!billing && !billing.billingRevision,
        deductionCount: deductions.filter(row => centavos(row.amount) > 0n).length,
        partialCount: deductions.filter(row => row.status === "P").length },
    });
  }
  return { month, periodCommand, rows, totals: remittanceTotals(rows),
    token: digest([month, periodCommand.revision_key, input.paymentDate, input.channel, rows]) };
}

export async function previewRemittancePreparation(body: unknown) {
  const { rows, totals, token, month } = await prepareRemittances(parseInput(batchRequest, body));
  return { rows, totals, token, openMonth: month };
}

async function submitForm(request: Request) {
  const type = request.headers.get("Content-Type");
  if (!type || !/^multipart\/form-data;/i.test(type) || !request.body) throw new LoanRequestError(400, "Send the remittance as a form.");
  const cap = maxRemittanceProofBytes + 48 * 1024;
  if (Number(request.headers.get("Content-Length")) > cap) throw new LoanRequestError(413, "Choose a proof file up to 5 MB.");
  let bytes = 0;
  const stream = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.length;
      if (bytes > cap) throw new LoanRequestError(413, "Choose a proof file up to 5 MB.");
      controller.enqueue(chunk);
    },
  }));
  try {
    return await new Response(stream, { headers: { "Content-Type": type } }).formData();
  } catch (error) {
    if (error instanceof LoanRequestError) throw error;
    throw new LoanRequestError(400, "Could not read the remittance form.");
  }
}

async function proofUpload(form: FormData, key: string) {
  const [file, extra] = form.getAll("proof");
  if (extra || !(file instanceof File) || !file.name || !file.size) throw new LoanRequestError(422, "Attach one proof of payment.");
  if (file.size > maxRemittanceProofBytes) throw new LoanRequestError(413, "Choose a proof file up to 5 MB.");
  const upload = new FormData();
  upload.set("uploadKey", key);
  upload.set("documentTypeId", "1");
  upload.set("files", file);
  try {
    return (await readCooperativeUpload(new Request("http://localhost/remittance-proof", { method: "POST", body: upload }))).files[0];
  } catch (error) {
    if (error instanceof CooperativeDocumentError) throw new LoanRequestError(error.status, error.message);
    throw error;
  }
}

async function removeUnusedProof(id: string) {
  if (!await readSavedBatch({ proof_file_id: { _eq: id } })) await governmentLoansDirectus("/files/" + id, { method: "DELETE" });
}

export async function submitRemittancePreparation(request: Request, actor: AgencyActor) {
  const key = parseInput(z.uuid(), request.headers.get("Idempotency-Key")).toLowerCase();
  const form = await submitForm(request);
  let data: unknown;
  try { data = JSON.parse(String(form.get("payment"))); } catch { throw new LoanRequestError(400, "Could not read the payment details."); }
  const input = parseInput(confirmRequest, data);
  if (input.items.some(row => !row.reference)) throw new LoanRequestError(422, "Enter the payment reference for every agency-month.");
  const proof = await proofUpload(form, key);
  const requestHash = digest([actor.actorId, input, proof.name, proof.digest]);
  const replay = async () => {
    const existing = await readSavedBatch({ command_key: { _eq: key } });
    if (!existing) return null;
    if (existing.request_hash !== requestHash) throw new LoanRequestError(409, "This submission key was already used.");
    return remittanceBatchSummary(existing);
  };
  const existing = await replay();
  if (existing) return existing;
  let prepared: Awaited<ReturnType<typeof prepareRemittances>>;
  try {
    prepared = await prepareRemittances(input);
  } catch (error) {
    const committed = await replay();
    if (committed) return committed;
    throw error;
  }
  const { token, month, periodCommand, rows, totals } = prepared;
  if (token !== input.token) throw new LoanRequestError(409, "Payroll, billing, or the period changed. Review a fresh preview.");
  const id = randomUUID();
  const fileId = randomUUID();
  const now = new Date().toISOString();

  try {
    await uploadCooperativeAsset(fileId, await privateRequestFolder(), proof.file, proof.mime, proof.extension, "Government Loans remittance " + id);
    if (await openMonth() !== month) throw new LoanRequestError(409, "The open period changed. Review the payment date.");
    const batch = {
      id, command_key: key, request_hash: requestHash, payment_date: input.paymentDate, channel: input.channel,
      uploaded_by: actor.actorName, uploaded_by_id: actor.actorId, uploaded_at: now,
      proof_file_id: fileId, proof_name: proof.name, proof_type: proof.mime, proof_size: proof.file.size, proof_hash: proof.digest,
    };
    await writeGovernmentLoansItem(GOVERNMENT_LOAN_REMITTANCE_BATCHES, {
      ...batch, period_command_id: periodCommand, audit: {
        action: "REMITTANCE_PREPARED", actorRole: actor.actorRole, observedOpenMonth: month, totals,
        agencyMonths: rows.map(row => row.key),
      },
      payments: { create: rows.map(row => ({
        id: randomUUID(), agency_id: row.agencyId, agency_name: row.agency, agency_code: row.agencyCode, payroll_month: row.month,
        live_key: row.key, state: "PENDING", prior_id: row.priorId, return_reason: null, submitted_at: now,
        payment_reference: row.reference, payment_date: input.paymentDate, due_date: row.due, days_late: row.daysLate,
        withheld: row.withheld, computed_penalty: row.computedPenalty, entered_penalty: row.penalty,
        penalty_overridden: row.penaltyOverridden, policy_snapshot: row.policy, source_snapshot: row.source,
      })) },
    }, "id", undefined, 30_000);
    return remittanceBatchSummary(batch);
  } catch (error) {
    if (error instanceof LoanRequestError || error instanceof GovernmentLoansDirectusError && error.status < 500) {
      await removeUnusedProof(fileId).catch(() => undefined);
    }
    const committed = await replay();
    if (committed) {
      await removeUnusedProof(fileId).catch(() => undefined);
      return committed;
    }
    if (error instanceof GovernmentLoansDirectusError && error.code === "RECORD_NOT_UNIQUE") throw notReady();
    throw error;
  }
}

const deductionQuery = z.object({ agencyId: positiveId, month: payrollMonth, page: pageNumber });
export async function listRemittanceDeductions(params: URLSearchParams, id?: string) {
  const requested = id ? null : parseInput(deductionQuery, Object.fromEntries(params));
  const saved = id ? await readSavedRemittance(id) : null;
  const agencyId = saved?.agency_id ?? requested!.agencyId;
  const receiptId = saved?.source_snapshot.receiptId ?? (await readCurrentPayrollReceipt(requested!.month))?.id;
  const page = requested?.page ?? parseInput(pageNumber, params.get("page") ?? undefined);
  if (!receiptId) return { items: [], hasMore: false };

  const rows = await readPayrollResultPage({ ...deductionFilter(receiptId, agencyId), amount: { _gt: 0 } }, pageSize + 1, (page - 1) * pageSize);
  const included = rows.slice(0, pageSize);
  const loanShape = z.object({ id: positiveId, employee_name: z.string().nullable(), enrollment: z.object({ agencyReference: z.string() }).nullable() });
  const loans = await readGroups<z.output<typeof loanShape>, number>(GOVERNMENT_LOAN_REQUESTS, loanShape, included.map(row => row.loanId),
    ids => ({ id: { _in: ids }, agency_id: { _eq: agencyId } }), "id");
  const byId = new Map(loans.map(loan => [loan.id, loan]));
  return { items: included.map(result => {
    const loan = byId.get(result.loanId);
    return { employeeId: result.employeeId, employee: loan?.employee_name ?? "Employee #" + result.employeeId,
      loanReference: loan?.enrollment?.agencyReference ?? "Loan #" + result.loanId, loanId: result.loanId, status: result.status,
      amount: result.amount, expected: result.expected, evidence: result.evidence };
  }), hasMore: rows.length > pageSize };
}

export async function readPreparedRemittance(id: string, proof: boolean) {
  const payment = await readSavedRemittance(id);
  const batch = await readSavedBatch({ id: { _eq: payment.batch_id } });
  if (!batch) throw new LoanRequestError(404, "Remittance proof could not be found.");
  if (proof) return downloadLoanDocument({
    file_id: batch.proof_file_id, file_name: batch.proof_name, mime_type: batch.proof_type, size_bytes: batch.proof_size,
  });
  return { payment, batch: remittanceBatchSummary(batch) };
}
