import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { overdueRequestCutoff } from "../approval/rules";
import { remittanceLiability } from "../remittances/approval/rules";
import { remitKey, remittancePenalty } from "../remittances/preparation/rules";
import { amountFromCentavos } from "../loans/position";
import { centavos } from "../payroll-handoff/contract";
import { getAgencyBillingSummary } from "./agency-billing";
import { readAgency, type AgencyActor } from "./agencies";
import { GOVERNMENT_LOAN_AGENCIES, GOVERNMENT_LOAN_PAYROLL_RESULTS, GOVERNMENT_LOAN_REMITTANCES, GOVERNMENT_LOAN_REMITTANCE_DECISIONS, GovernmentLoansDirectusError,
  governmentLoansDirectus, writeGovernmentLoansItem } from "./directus";
import { readEnrollmentRows } from "./enrollment-sources";
import { readOpenMonth } from "./loan-enrollment";
import { isoDateTime, loanCommandPartKey } from "./loan-requests";
import { payrollMoney, readCurrentPayrollReceipt, readPayrollPages } from "./payroll-month-store";
import { nextPeriodCommand } from "./period-commands";
import { approvalQueueRow, readRemittanceOverview, readSavedBatch, readSavedRemittance, remittanceBatchSummary } from "./remittance-records";
import { downloadLoanDocument, privateRequestFolder } from "./request-documents";
import { LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";

const pageSize = 25;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const checkSchema = z.object({ label: z.string(), status: z.enum(["pass", "warning", "block", "na"]), detail: z.string() });
const outcome = z.object({ id: z.uuid(), approved: z.boolean(), reason: z.string().nullable() });
const batchResult = z.object({ items: z.array(outcome) });
const decisionRow = z.object({
  id: z.uuid(), command_key: z.uuid(), request_hash: z.string(), action: z.enum(["APPROVE", "RETURN", "BULK_START", "BULK_COMPLETE"]),
  actor_name: z.string(), decided_at: z.string(), reason: z.string().nullable(), evidence: z.unknown(),
});
const decisionFields = Object.keys(decisionRow.shape).join(",");
type Decision = z.output<typeof decisionRow>;
type Check = z.output<typeof checkSchema>;
const summary = z.object({ id: z.uuid(), agency: z.string(), month: z.string(), reference: z.string(),
  amount: z.string(), penalty: z.string(), paymentDate: z.string() });
const reviewEvidence = z.object({ checks: z.array(checkSchema), latestReceipt: z.object({ id: z.uuid(), revision: positiveId }).nullable(),
  billingRevision: z.object({ id: z.uuid(), number: positiveId }).nullable(), billingDifferences: z.number(),
  billingAmounts: z.object({ billed: z.string().nullable(), deduction: z.string().nullable(), difference: z.string().nullable() }).nullable(),
  confirmedWithheld: z.string().nullable(), observedOpenMonth: z.string().nullable(),
  agencyName: z.string(), employerNumber: z.string().nullable(), referenceLabel: z.string() });
const savedEvidence = z.object({ payment: summary, review: reviewEvidence });
const queueQuery = z.object({ q: z.string().trim().max(120).default(""), agencyId: positiveId.optional(),
  overdue: z.enum(["1"]).optional(), page: pageNumber, historyPage: pageNumber });

export async function listRemittanceApproval(params: URLSearchParams) {
  const { q, agencyId, overdue, page, historyPage } = parseInput(queueQuery, Object.fromEntries(params));
  const today = todayManila();
  const pendingFilter = { state: { _eq: "PENDING" }, ...(agencyId ? { agency_id: { _eq: agencyId } } : {}),
    ...(overdue ? { submitted_at: { _lt: overdueRequestCutoff(new Date(today + "T00:00:00+08:00")) } } : {}),
    ...(q ? { _or: [{ payment_reference: { _icontains: q } }, { agency_name: { _icontains: q } },
      { batch_id: { uploaded_by: { _icontains: q } } }] } : {}) };
  const [pending, history] = await Promise.all([
    readEnrollmentRows(GOVERNMENT_LOAN_REMITTANCES, approvalQueueRow,
      "id,agency_id,agency_name,payroll_month,withheld,entered_penalty,payment_reference,payment_date,submitted_at,batch_id.uploaded_by",
      pendingFilter, pageSize + 1, "submitted_at,id", (page - 1) * pageSize),
    readEnrollmentRows(GOVERNMENT_LOAN_REMITTANCE_DECISIONS, decisionRow, decisionFields,
      { action: { _in: ["APPROVE", "RETURN"] } }, pageSize + 1, "-decided_at,-id", (historyPage - 1) * pageSize),
  ]);
  return { today, pageSize, hasMore: pending.length > pageSize, hasMoreHistory: history.length > pageSize,
    pending: pending.slice(0, pageSize).map(row => ({ id: row.id, agencyId: row.agency_id, agency: row.agency_name,
      month: row.payroll_month, amount: row.withheld, penalty: row.entered_penalty, reference: row.payment_reference,
      paymentDate: row.payment_date, submittedAt: isoDateTime(row.submitted_at), preparedBy: row.batch_id.uploaded_by })),
    history: history.slice(0, pageSize).map(row => ({ ...savedEvidence.parse(row.evidence).payment, ...decisionSummary(row) })),
  };
}

export function listApprovalAgencies() {
  return readPayrollPages(GOVERNMENT_LOAN_AGENCIES, z.object({ id: positiveId, display_name: z.string() }),
    "id,display_name", {}, "display_name,id");
}

function decisionSummary(row: Decision) {
  return { decisionId: row.id, action: row.action, actor: row.actor_name, at: isoDateTime(row.decided_at), reason: row.reason };
}

async function readDecision(filter: object) {
  const [row] = await readEnrollmentRows(GOVERNMENT_LOAN_REMITTANCE_DECISIONS, decisionRow, decisionFields, filter, 1);
  return row ?? null;
}

async function savedSource(id: string) {
  const payment = await readSavedRemittance(id);
  const batch = await readSavedBatch({ id: { _eq: payment.batch_id } });
  if (!batch) throw new LoanRequestError(503, "The prepared payment details are unavailable.");
  return { payment, batch };
}

async function proofPresent(id: string, size: number) {
  const folder = await privateRequestFolder();
  try {
    const response = await governmentLoansDirectus("/files/" + id + "?fields=id,folder,filesize");
    const { data } = z.object({ data: z.object({ id: z.uuid(), folder: z.uuid().nullable(), filesize: z.coerce.number() }) })
      .parse(await response.json());
    return data.id === id && data.folder === folder && data.filesize === size;
  } catch (error) {
    if (error instanceof GovernmentLoansDirectusError && [403, 404].includes(error.status)) return false;
    throw error;
  }
}

export async function downloadApprovalProof(id: string, inline: boolean) {
  const { batch } = await savedSource(id);
  if (!await proofPresent(batch.proof_file_id, batch.proof_size)) throw new LoanRequestError(404, "Payment proof is unavailable.");
  const proof = await downloadLoanDocument({ file_id: batch.proof_file_id, file_name: batch.proof_name,
    mime_type: batch.proof_type, size_bytes: batch.proof_size });
  if (inline) {
    const disposition = proof.headers.get("Content-Disposition");
    if (disposition) proof.headers.set("Content-Disposition", disposition.replace(/^attachment;/, "inline;"));
    proof.headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
  }
  return proof;
}

async function currentReview(source: Awaited<ReturnType<typeof savedSource>>, openMonth: string | null) {
  const { payment, batch } = source;
  const [agency, receipt, proof] = await Promise.all([
    readAgency(payment.agency_id), readCurrentPayrollReceipt(payment.payroll_month),
    proofPresent(batch.proof_file_id, batch.proof_size),
  ]);
  const billing = agency.sendsBilling ? await getAgencyBillingSummary(agency.id, payment.payroll_month) : null;
  if (billing && billing.payrollReceipt?.id !== receipt?.id) {
    throw new LoanRequestError(409, "Payroll changed during review. Refresh the remittance.");
  }
  const amounts = receipt && !billing ? await readPayrollPages(GOVERNMENT_LOAN_PAYROLL_RESULTS,
    z.object({ amount: payrollMoney }), "amount", { receipt_id: { _eq: receipt.id }, agency_id: { _eq: payment.agency_id },
      status: { _in: ["D", "P", "X"] } }, "id") : [];
  const confirmedWithheld = billing ? billing.totals.deduction :
    receipt ? amountFromCentavos(amounts.reduce((total, row) => total + centavos(row.amount), 0n)) : null;
  const expectedPenalty = remittancePenalty(payment.withheld, payment.payment_date, payment.due_date, payment.policy_snapshot).computedPenalty;
  const billingDifferences = billing?.totals.discrepancies ?? 0;
  const inPeriod = openMonth !== null && payment.payment_date.slice(0, 7) >= openMonth;
  const checks: Check[] = [
    { label: "Payment equals confirmed withholding", status: confirmedWithheld === payment.withheld ? "pass" : "warning",
      detail: confirmedWithheld === null ? "Confirmed Payroll receipt unavailable" : "Paid " + payment.withheld + " · Withheld " + confirmedWithheld },
    { label: "Payment proof", status: proof ? "pass" : "warning", detail: proof ? batch.proof_name : "Proof unavailable" },
    { label: agency.paymentReferenceLabel, status: payment.payment_reference.trim() ? "pass" : "warning",
      detail: payment.payment_reference || "Missing reference" },
    { label: "Penalty matches agency rule", status: expectedPenalty === payment.entered_penalty ? "pass" : "warning",
      detail: "Entered " + payment.entered_penalty + " · Calculated " + expectedPenalty },
    { label: "Agency billing reconciled", status: !billing ? "na" : !billing.billingRevision || billingDifferences ? "warning" : "pass",
      detail: !billing ? "Agency does not send billing" : !billing.billingRevision ? "Expected agency bill is missing" :
        billingDifferences ? billingDifferences + " difference(s)" : "Matched" },
    { label: "Payment period", status: inPeriod ? "pass" : "block",
      detail: !openMonth ? "Open payment period is unavailable" : inPeriod ? payment.payment_date.slice(0, 7) + " is open" :
        payment.payment_date.slice(0, 7) + " is closed" },
  ];
  return { checks, confirmedWithheld, latestReceipt: receipt ? { id: receipt.id, revision: receipt.revision } : null,
    billingRevision: billing?.billingRevision ? { id: billing.billingRevision.id, number: billing.billingRevision.number } : null,
    billingDifferences, billingAmounts: billing ? { billed: billing.totals.billed, deduction: billing.totals.deduction,
      difference: billing.totals.difference } : null,
    observedOpenMonth: openMonth, agencyName: agency.fullName, employerNumber: agency.employerNumber,
    referenceLabel: agency.paymentReferenceLabel };
}

export async function reviewRemittanceApproval(id: string) {
  const source = await savedSource(id);
  const { payment, batch } = source;
  const decision = await readDecision({ remittance_id: { _eq: id } });
  const evidence = decision ? savedEvidence.parse(decision.evidence).review : await currentReview(source, await readOpenMonth());
  const state = decision?.action === "APPROVE" ? "APPROVED" : decision?.action === "RETURN" ? "RETURNED" : payment.state;
  const payments = decision ? [{ ...payment, state }] : await readRemittanceOverview({ agency_id: { _eq: payment.agency_id }, payroll_month: { _eq: payment.payroll_month },
    state: { _eq: "APPROVED" } });
  return { payment: { ...payment, state }, batch: remittanceBatchSummary(batch), evidence, token: hash([payment.id, state, evidence]),
    decision: decision ? decisionSummary(decision) : null, liability: remittanceLiability(evidence.confirmedWithheld, payments) };
}

const input = z.strictObject({
  action: z.enum(["APPROVE", "RETURN"]), token: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledgeWarnings: z.boolean().default(false), reason: z.string().trim().max(500).default(""),
});
const bulkInput = z.strictObject({ ids: z.array(z.uuid()).min(1).max(pageSize)
  .refine(ids => new Set(ids).size === ids.length) });

function command(key: string, request: unknown, actor: AgencyActor) {
  return { key, actor, requestHash: hash([actor.actorId, request]) };
}
type Command = ReturnType<typeof command>;

async function replay(command: Command) {
  const row = await readDecision({ command_key: { _eq: command.key } });
  if (row && row.request_hash !== command.requestHash) throw new LoanRequestError(409, "This decision key was already used.");
  return row;
}

async function commit(command: Command, action: Decision["action"], evidence: unknown, fields: object = {}) {
  const row = { id: randomUUID(), command_key: command.key, request_hash: command.requestHash, action,
    actor_id: command.actor.actorId, actor_name: command.actor.actorName, actor_role: command.actor.actorRole,
    decided_at: new Date().toISOString(), reason: null, evidence, ...fields };
  try {
    await writeGovernmentLoansItem(GOVERNMENT_LOAN_REMITTANCE_DECISIONS, row, "id", undefined, 30_000);
    return decisionRow.parse(row);
  } catch (error) {
    const existing = await replay(command);
    if (existing) return existing;
    if (error instanceof GovernmentLoansDirectusError && error.code === "RECORD_NOT_UNIQUE") {
      throw new LoanRequestError(409, "A decision or period change was recorded. Refresh the remittance before retrying.");
    }
    throw error;
  }
}

async function decide(id: string, request: z.output<typeof input> | null, command: Command) {
  const existing = await replay(command);
  if (existing) return existing;
  try {
    const source = await savedSource(id);
    const { payment } = source;
    if (payment.state !== "PENDING" || payment.live_key !== remitKey(payment.agency_id, payment.payroll_month)) {
      throw new LoanRequestError(409, "This remittance is no longer awaiting approval.");
    }
    const action = request?.action ?? "APPROVE";
    if (action === "RETURN" && !request?.reason) throw new LoanRequestError(422, "Enter a reason for returning this remittance.",
      { reason: "Enter a return reason." });
    const observedOpenMonth = await readOpenMonth();
    if (!observedOpenMonth) throw new LoanRequestError(409, "The open payment period is unavailable.");
    const period = await nextPeriodCommand(observedOpenMonth);
    const review = await currentReview(source, observedOpenMonth);
    const blockers = review.checks.filter(check => check.status === "block");
    const warnings = review.checks.filter(check => check.status === "warning");
    if (request && request.token !== hash([payment.id, payment.state, review])) {
      throw new LoanRequestError(409, "Review evidence changed. Refresh the remittance before deciding.");
    }
    if (action === "APPROVE") {
      if (blockers.length) throw new LoanRequestError(409, blockers.map(check => check.detail).join(". "));
      if (warnings.length && (!request || !request.acknowledgeWarnings)) {
        throw new LoanRequestError(422, warnings.map(check => check.label + " · " + check.detail).join("; "));
      }
    }
    if (await readOpenMonth() !== observedOpenMonth) throw new LoanRequestError(409, "The payment period changed. Refresh the review.");
    return await commit(command, action, { review, payment: { id, agency: payment.agency_name, month: payment.payroll_month,
      amount: payment.withheld, penalty: payment.entered_penalty, reference: payment.payment_reference, paymentDate: payment.payment_date } }, {
      remittance_id: { id, state: action === "APPROVE" ? "APPROVED" : "RETURNED",
        ...(action === "RETURN" ? { live_key: null, return_reason: request!.reason } : {}) },
      period_command_id: period, reason: request?.reason || null,
    });
  } catch (error) {
    const saved = await replay(command);
    if (saved) return saved;
    throw error;
  }
}

export async function decideRemittanceApproval(id: string, body: unknown, key: string | null, actor: AgencyActor) {
  const request = parseInput(input, body);
  return decisionSummary(await decide(id, request, command(parseInput(z.uuid(), key), [id, request], actor)));
}

export async function bulkApproveRemittances(body: unknown, key: string | null, actor: AgencyActor) {
  const { ids } = parseInput(bulkInput, body);
  const batch = command(parseInput(z.uuid(), key), ids, actor);
  if (!await replay(batch)) await commit(batch, "BULK_START", { ids });
  const complete = command(loanCommandPartKey(batch.key, "result"), batch.requestHash, actor);
  const saved = await replay(complete);
  if (saved) return batchResult.parse(saved.evidence);
  const items: z.output<typeof outcome>[] = [];
  for (const id of ids) {
    const part = command(loanCommandPartKey(batch.key, id), [batch.requestHash, id], actor);
    try {
      await decide(id, null, part);
      items.push({ id, approved: true, reason: null });
    } catch (error) {
      if (!(error instanceof LoanRequestError) || error.status >= 500) throw error;
      items.push({ id, approved: false, reason: error.message });
    }
  }
  return batchResult.parse((await commit(complete, "BULK_COMPLETE", { items })).evidence);
}
