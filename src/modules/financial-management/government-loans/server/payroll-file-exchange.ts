import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { sameProgram } from "../enrollment/payroll-match";
import { normalizedReference } from "../enrollment/rules";
import { canStartInOpenPeriod, isEnrollmentPreparer } from "../enrollment/verification-rules";
import { centavos, reviewPayrollReceipts } from "../payroll-handoff/contract";
import { payrollInstructionCsv, payrollReceiptMaxBytes, readPayrollReceiptCsv } from "../payroll-handoff/file-exchange";
import type { HandoffResult, PayrollAcknowledgement, PayrollHandoffPayload } from "../payroll-handoff/types";
import type { AgencyActor } from "./agencies";
import { GOVERNMENT_LOAN_REQUEST_HISTORY } from "./directus";
import { readEnrollmentRows, readLinkedPayrollLoans } from "./enrollment-sources";
import { checkLiveEnrollmentReference, readOpenMonth, readStagedEnrollment } from "./loan-enrollment";
import { commitRequestRevision, loanCommand, loanCommandPartKey, readCommandReceipt } from "./loan-requests";
import { handoffStatus, hasPayrollLease, payrollFileEvidence, readPayrollHandoff } from "./payroll-handoff-store";
import { activeEmployee } from "./request-assessment";
import { LoanRequestError, parseInput, positiveId } from "./request-input";

const revisionInput = z.strictObject({ expectedRevision: positiveId });
const resultFields = z.object({ status: z.enum(["ACTIVATING", "ACTIVE"]), handoffId: z.uuid(), state: handoffStatus });
const fileResult = resultFields.extend({ reason: z.string().nullable() });
const archivedSource = payrollFileEvidence.extend({
  sha256: z.string().regex(/^[a-f\d]{64}$/),
  bytes: z.string().min(1).max(Math.ceil(payrollReceiptMaxBytes / 3) * 4),
});
const fileEvent = z.object({
  revision: positiveId,
  after_values: fileResult.extend({ source: archivedSource, receiptDigest: z.string().optional() }),
});
const importActions = ["PAYROLL_ACKNOWLEDGEMENT_IMPORTED", "PAYROLL_HANDOFF_ACCEPTED"] as const;
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");

async function activeHandoff(id: number) {
  const row = await readStagedEnrollment(id);
  if (row.status !== "ACTIVE" && row.status !== "ACTIVATING") {
    throw new LoanRequestError(409, "Verify this enrollment before exchanging its Payroll files.");
  }
  const handoff = await readPayrollHandoff(id);
  if (!handoff) throw new LoanRequestError(404, "The Payroll handoff could not be found.");
  if (hasPayrollLease(handoff)) throw new LoanRequestError(409, "A prior Payroll check is finishing. Reload the handoff.");
  return { row: { ...row, status: row.status }, handoff };
}

const stale = () => new LoanRequestError(409, "The handoff changed. Reload it before continuing.");

function csvResponse(bytes: Uint8Array<ArrayBuffer>, filename: string) {
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, character => "%" + character.charCodeAt(0).toString(16).toUpperCase());
  return new Response(bytes, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Length": String(bytes.length),
      "Content-Disposition": "attachment; filename*=UTF-8''" + encoded,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function exportPayrollInstructions(id: number, body: unknown, key: string | null, actor: AgencyActor) {
  const { expectedRevision } = parseInput(revisionInput, body);
  const { row, handoff } = await activeHandoff(id);
  const command = loanCommand(key, { operation: "export-payroll-instructions", expectedRevision, handoffId: handoff.id }, actor, id);
  const bytes = new TextEncoder().encode(payrollInstructionCsv(handoff.payload));
  const filename = "payroll-instructions-" + handoff.id + ".csv";
  if (!await readCommandReceipt(command)) {
    if (row.revision !== expectedRevision) throw stale();
    if (!handoff.delivery.fileExchange || (handoff.state !== "QUEUED" && handoff.state !== "RETRYABLE")) {
      throw new LoanRequestError(409, "Confirm the outcome with Payroll before downloading this handoff again.");
    }
    if (!canStartInOpenPeriod(handoff.payload.start.effectiveMonth, await readOpenMonth())) {
      throw new LoanRequestError(422, "The first deduction month has closed or could not be verified. Review the dates before sending.");
    }
    const [employee] = await Promise.all([
      activeEmployee(row.form.employeeId, todayManila()), checkLiveEnrollmentReference(row),
    ]);
    if (!employee) throw new LoanRequestError(422, "The employee is no longer active. Review the handoff before sending.");
    const now = new Date().toISOString();
    await commitRequestRevision(command, "PAYROLL_HANDOFF_EXPORTED", row, {
      payroll_handoffs: { update: [{ id: handoff.id, state: "AWAITING_ACK", updated_at: now,
        delivery: { ...handoff.delivery, reason: null, lease: null, lastExportedAt: now } }] },
    }, { status: row.status, state: handoff.state }, {
      status: row.status, state: "AWAITING_ACK", handoffId: handoff.id, filename, sha256: sha256(bytes),
    }, now);
  }
  return csvResponse(bytes, filename);
}

const loanIdentity = z.object({ loan_id: positiveId, user_id: positiveId, benefit_code: z.string(),
  reference_no: z.string().nullable(), loan_name: z.string().nullable(),
  amortization_amount: z.union([z.number(), z.string()]).nullable(),
});
const payrollCutoff = z.object({ id: positiveId });

async function receiptSourceProblems(payload: PayrollHandoffPayload, acknowledgements: PayrollAcknowledgement[]) {
  const problems = new Map<string, string>();
  if (!acknowledgements.length) return problems;
  const ids = acknowledgements.map(ack => ack.payrollLoanId);
  const cutoffIds = acknowledgements.flatMap(ack => ack.cutoffId === undefined ? [] : [ack.cutoffId]);
  const [year, month] = payload.start.effectiveMonth.split("-").map(Number);
  const start = acknowledgements.find(ack => ack.instructionId === payload.start.id);
  const [loans, cutoffs, owners] = await Promise.all([
    readEnrollmentRows("benefit_loans", loanIdentity, Object.keys(loanIdentity.shape).join(","), { loan_id: { _in: ids } }, ids.length),
    cutoffIds.length ? readEnrollmentRows("cutoff_settings", payrollCutoff, "id", {
      id: { _in: cutoffIds }, year: { _eq: year }, month: { _eq: month },
    }, cutoffIds.length) : [],
    start ? readLinkedPayrollLoans([start.payrollLoanId]) : [],
  ]);
  for (const ack of acknowledgements) {
    const loan = loans.find(item => item.loan_id === ack.payrollLoanId);
    const amount = String(loan?.amortization_amount ?? "").replace(/(\.\d{2})0+$/, "$1");
    if (!loan || loan.user_id !== payload.employeeId || loan.benefit_code !== payload.benefitCode ||
      (ack === start && (!sameProgram(loan.loan_name, payload.program) ||
        normalizedReference(loan.reference_no ?? "") !== normalizedReference(payload.start.agencyReference) ||
        !/^\d{1,13}(\.\d{1,2})?$/.test(amount) || centavos(amount) !== centavos(payload.start.monthlyAmount) ||
        owners.some(owner => owner.id !== payload.enrollmentId)))) {
      problems.set(ack.instructionId, "the receipt could not be matched to the expected Payroll loan and terms.");
    } else if (ack.cutoffId !== undefined && !cutoffs.some(cutoff => cutoff.id === ack.cutoffId)) {
      problems.set(ack.instructionId, "the Payroll cutoff does not belong to the effective month.");
    }
  }
  return problems;
}

function readFileEvent(id: number, filter: object) {
  return readEnrollmentRows(GOVERNMENT_LOAN_REQUEST_HISTORY, z.object({ revision: positiveId, after_values: z.unknown() }), "revision,after_values", {
    ...filter, request_id: { _eq: id }, action: { _in: importActions },
  }, 1).then(events => fileEvent.safeParse(events[0]).data ?? null);
}

async function readAcknowledgementUpload(request: Request) {
  const revision = positiveId.safeParse(request.headers.get("If-Match"));
  if (!revision.success) throw new LoanRequestError(422, "Reload the handoff before importing an acknowledgement.");
  let name = "";
  try {
    name = decodeURIComponent(request.headers.get("X-Payroll-File-Name") ?? "");
  } catch {
    throw new LoanRequestError(422, "Use a plain CSV filename.");
  }
  if (!request.body || !name.toLowerCase().endsWith(".csv") || !/^text\/csv(?:;|$)/i.test(request.headers.get("Content-Type") ?? "")) {
    throw new LoanRequestError(422, "Choose a Payroll acknowledgement CSV.");
  }
  if (name.length > 160 || /[\\/\u0000-\u001F\u007F]/u.test(name)) throw new LoanRequestError(422, "Use a shorter, plain CSV filename.");
  const tooLarge = () => new LoanRequestError(413, "Choose a Payroll acknowledgement CSV of 16 KB or less.");
  if (Number(request.headers.get("Content-Length")) > payrollReceiptMaxBytes) throw tooLarge();
  const reader = request.body.getReader();
  const buffer = Buffer.alloc(payrollReceiptMaxBytes);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.length > buffer.length) throw tooLarge();
      buffer.set(value, length);
      length += value.length;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = buffer.subarray(0, length);
  return { bytes, name, revision: revision.data, digest: sha256(bytes) };
}

export async function importPayrollAcknowledgements(id: number, request: Request, actor: AgencyActor): Promise<HandoffResult & { reason: string | null }> {
  const { row, handoff } = await activeHandoff(id);
  if (isEnrollmentPreparer(row.enrollment, actor.actorId)) {
    throw new LoanRequestError(403, "A staff member distinct from the encoder and resubmitter must record Payroll acknowledgements.");
  }
  const upload = await readAcknowledgementUpload(request);
  let receipts;
  try {
    const csv = new TextDecoder("utf-8", { fatal: true }).decode(upload.bytes);
    receipts = readPayrollReceiptCsv(csv, handoff.payload);
  } catch (error) {
    throw new LoanRequestError(422, error instanceof TypeError ? "Save the acknowledgement CSV using UTF-8 encoding." :
      error instanceof Error ? error.message : "The acknowledgement CSV could not be read.");
  }
  receipts.sort((first, second) => first.instructionId.localeCompare(second.instructionId));
  const receiptDigest = sha256(JSON.stringify(receipts));
  const receiptKeys = receipts.map(receipt => [receipt.instructionId, receipt.result, receipt.receiptId]);
  const key = loanCommandPartKey(handoff.id, "payroll-ack:" + JSON.stringify(receiptKeys));
  const readReplay = async () => {
    const event = await readFileEvent(id, { command_key: { _eq: key } });
    if (event && event.after_values.receiptDigest !== receiptDigest) {
      throw new LoanRequestError(409, "A Payroll receipt reference was already used with different details.");
    }
    return event;
  };
  const existing = await readReplay();
  if (existing) return { id, revision: existing.revision, ...fileResult.parse(existing.after_values) };

  const recorded = handoff.delivery.acknowledgements.filter(ack =>
    handoff.delivery.fileExchange || handoff.state === "ACCEPTED" || ack.sourceRevision !== undefined);
  let review = reviewPayrollReceipts(handoff.payload, receipts, recorded);
  if (review.repeated && review.state === handoff.state) {
    return { id, revision: row.revision, status: row.status, handoffId: handoff.id, state: handoff.state, reason: handoff.delivery.reason };
  }
  if (row.revision !== upload.revision) throw stale();
  if (handoff.state === "ACCEPTED") throw new LoanRequestError(409, "This handoff already has confirmed Payroll receipts.");
  if (handoff.state === "QUEUED" && handoff.delivery.fileExchange) {
    throw new LoanRequestError(409, "Download the instruction CSV before importing a Payroll acknowledgement.");
  }
  const problems = await receiptSourceProblems(handoff.payload, review.acknowledgements.filter(ack => !recorded.includes(ack)));
  if (problems.size) review = reviewPayrollReceipts(handoff.payload, receipts, recorded, problems);
  const { lastExportedAt } = handoff.delivery;
  if (review.state === "RETRYABLE" && lastExportedAt && receipts.some(receipt => receipt.acknowledgedAt < lastExportedAt)) {
    throw new LoanRequestError(422, "This Payroll confirmation predates the latest download. Obtain confirmation for the latest delivery.");
  }
  if (review.state === "RETRYABLE" && !canStartInOpenPeriod(handoff.payload.start.effectiveMonth, await readOpenMonth())) {
    review = { ...review, state: "NEEDS_REVIEW", reason: "Payroll did not apply the instructions and the effective month is closed or unavailable. Review the dates." };
  }

  const now = new Date().toISOString();
  const lastImport = { name: upload.name, revision: row.revision + 1, importedBy: actor.actorName, importedAt: now };
  const source = { ...lastImport, sha256: upload.digest, bytes: upload.bytes.toString("base64") };
  const acknowledgements = review.acknowledgements.map(ack => recorded.includes(ack) ? ack : { ...ack, sourceRevision: lastImport.revision });
  const startAck = acknowledgements.find(ack => ack.instructionId === handoff.payload.start.id);
  const payrollLoanId = review.state === "ACCEPTED" ? startAck?.payrollLoanId : null;
  const fileExchange = handoff.delivery.fileExchange || review.state === "RETRYABLE" || review.state === "ACCEPTED";
  const status = fileExchange ? "ACTIVE" : row.status;
  const command = loanCommand(key, { operation: "import-payroll-acknowledgements", receiptDigest }, actor, id);
  const after = { status, state: review.state, reason: review.reason, handoffId: handoff.id, source, receiptDigest, receipts, acknowledgements };
  const saved = await commitRequestRevision(command, payrollLoanId ? "PAYROLL_HANDOFF_ACCEPTED" : "PAYROLL_ACKNOWLEDGEMENT_IMPORTED",
    row, {
      status,
      ...(payrollLoanId ? { payroll_loan_id: payrollLoanId, enrollment: { ...row.enrollment, payrollLoanId } } : {}),
      payroll_handoffs: { update: [{ id: handoff.id, state: review.state, updated_at: now,
        delivery: { ...handoff.delivery, reason: review.reason, acknowledgements, lease: null, fileExchange, lastImport } }] },
    }, { status: row.status, state: handoff.state, acknowledgements: handoff.delivery.acknowledgements }, after, now)
    .catch(async error => {
      const replay = await readReplay().catch(readError => {
        if (readError instanceof LoanRequestError) throw readError;
        return null;
      });
      if (replay) return replay;
      throw error;
    });
  return { id, revision: saved.revision, ...fileResult.parse(saved.after_values) };
}

export async function downloadPayrollAcknowledgement(id: number, revision: string | null) {
  const parsed = positiveId.safeParse(revision);
  if (!parsed.success) throw new LoanRequestError(404, "The acknowledgement file could not be found.");
  const event = await readFileEvent(id, { revision: { _eq: parsed.data } });
  if (!event) throw new LoanRequestError(404, "The acknowledgement file could not be found.");
  const source = event.after_values.source;
  const bytes = Uint8Array.from(Buffer.from(source.bytes, "base64"));
  if (bytes.length > payrollReceiptMaxBytes || sha256(bytes) !== source.sha256) {
    throw new LoanRequestError(503, "The stored acknowledgement file is unavailable.");
  }
  return csvResponse(bytes, source.name);
}
