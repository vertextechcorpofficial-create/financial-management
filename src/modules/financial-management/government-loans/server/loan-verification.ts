import "server-only";

import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { requestWaitingDays } from "../approval/rules";
import { enrollmentReviewStatuses } from "../enrollment/types";
import { canStartInOpenPeriod, isEnrollmentPreparer, needsImportTransferChoice, requiredEnrollmentEvidence } from "../enrollment/verification-rules";
import {
  ENROLLMENT_PAGE_SIZE, enrollmentDecisions, verificationStatuses, type BulkVerificationResult, type VerificationOutcome,
  type VerificationQueue, type VerificationReview, type VerificationSelection,
} from "../enrollment/verification-types";
import { enrollmentEvidenceKinds } from "../requests/types";
import type { AgencyActor } from "./agencies";
import { GOVERNMENT_LOAN_REQUESTS } from "./directus";
import { readEnrollmentRows } from "./enrollment-sources";
import { commitEnrollmentActivation } from "./loan-activation";
import {
  checkLiveEnrollmentReference, enrollmentDetail, enrollmentListItem, listEnrollmentRecords, readOpenMonth, readStagedEnrollment,
} from "./loan-enrollment";
import {
  commitRequestRevision, isoDateTime, loanCommand, loanCommandPartKey, readCommandReceipt, readLoanDocuments,
  readRequestDocuments, recordLoanBatchEvent, type StoredLoanDocument,
} from "./loan-requests";
import { LoanRequestError, parseInput, positiveId } from "./request-input";
import { handoffStatus, readPayrollHandoff, readSuccessorHandoff } from "./payroll-handoff-store";
import { nextPeriodCommand } from "./period-commands";
import { readMonthReceipts } from "./payroll-month-store";
import { activeEmployee } from "./request-assessment";

type Enrollment = Awaited<ReturnType<typeof readStagedEnrollment>>;
type Command = ReturnType<typeof loanCommand>;

export async function listEnrollmentVerification(params: URLSearchParams, actor: AgencyActor): Promise<VerificationQueue> {
  const filters = new URLSearchParams(params);
  const status = parseInput(z.enum(verificationStatuses), filters.get("status") ?? "ENROLLED");
  filters.set("status", status);
  const [result, openMonth] = await Promise.all([listEnrollmentRecords(filters), readOpenMonth()]);
  const documents = await readLoanDocuments(result.items.map(row => row.id));
  const now = new Date();
  return { hasMore: result.hasMore, openMonth,
    summary: { ENROLLED: result.summary.ENROLLED, VERIFIED: result.summary.VERIFIED,
      ACTIVATING: result.summary.ACTIVATING, ACTIVE: result.summary.ACTIVE },
    items: result.items.flatMap(row => {
      const enrollment = row.enrollment;
      if (!enrollment) return [];
      const required = requiredEnrollmentEvidence(enrollment, row.form.applicationType === "RENEWAL");
      return [{
        ...enrollmentListItem(row), enrollment, revision: row.revision,
        canDecide: status === "ENROLLED" && !isEnrollmentPreparer(enrollment, actor.actorId),
        documentsPresent: required.filter(kind => documents.some(file => file.request_id === row.id && file.kind === kind)).length,
        documentsRequired: required.length,
        waitingDays: requestWaitingDays(isoDateTime(enrollment.resubmittedAt ?? enrollment.encodedAt), now),
      }];
    }) };
}

async function verificationChecks(row: Enrollment, documents: StoredLoanDocument[]) {
  const [openMonth, payroll, employee, successor] = await Promise.all([
    readOpenMonth().catch(() => null),
    checkLiveEnrollmentReference(row).then(mapping => ({ ...mapping, reason: null })).catch(error => ({
      code: null, warnings: [], reason: error instanceof LoanRequestError ? error.message : "Could not check the current agency reference. Try again.",
    })),
    activeEmployee(row.form.employeeId, todayManila()),
    row.enrollment.priorLoanId ? readSuccessorHandoff(row.enrollment.priorLoanId) : null,
  ]);
  const required = requiredEnrollmentEvidence(row.enrollment, row.form.applicationType === "RENEWAL");
  const evidence: { id: number; kind: string; fileId: string; sha256: string }[] = [];
  const checks: VerificationReview["checks"] = required.map(kind => {
    const [file, duplicate] = documents.filter(document => document.kind === kind);
    if (file && !duplicate) evidence.push({ id: file.id, kind, fileId: file.file_id, sha256: file.sha256 });
    return { label: enrollmentEvidenceKinds[kind], reason: !file ? "Attach this document before verification." :
      duplicate ? "Resolve duplicate evidence before verification." : null };
  });
  if (needsImportTransferChoice(row.enrollment)) {
    checks.push({ label: "Import classification", reason: "Record whether this import is a transfer in Enrollment." });
  }
  if (row.form.applicationType === "RENEWAL" && !row.enrollment.priorLoanId) {
    checks.push({ label: "Prior loan", reason: "Choose the prior loan for this renewal." });
  } else if (successor) {
    checks.push({ label: "Prior loan", reason: "Another renewal already reserves this prior Payroll loan." });
  }
  checks.push({ label: "Active employee", reason: employee ? null : "Confirm the employee is active before verification." });
  checks.push({
    label: "First deduction month",
    reason: !openMonth ? "The current open month could not be confirmed." :
      canStartInOpenPeriod(row.enrollment.firstDeductionMonth, openMonth) ? null : `Choose a first deduction month of ${openMonth} or later.`,
  }, { label: "Live reference and Payroll mapping", reason: payroll.reason });
  return { checks, evidence, openMonth, warnings: payroll.warnings, code: payroll.code };
}

export async function getEnrollmentVerification(id: number, actor: AgencyActor): Promise<VerificationReview> {
  const row = await readStagedEnrollment(id);
  const documents = await readRequestDocuments(id);
  const [record, validation] = await Promise.all([
    enrollmentDetail(row, documents), ["ENROLLED", "VERIFIED"].includes(row.status) ? verificationChecks(row, documents) : null,
  ]);
  const canReview = !isEnrollmentPreparer(row.enrollment, actor.actorId);
  return {
    record: { ...record, enrollment: row.enrollment },
    canDecide: row.status === "ENROLLED" && canReview,
    canActivate: row.status === "VERIFIED" && canReview,
    canManageHandoff: Boolean(record.payrollHandoff && !["ACCEPTED", "CANCELLED"].includes(record.payrollHandoff.state) && canReview),
    canReturnRenewal: canReview && row.status === "ACTIVE" && Boolean(record.payrollHandoff?.payload.stop) &&
      record.payrollHandoff?.state === "QUEUED" && record.payrollHandoff.fileExchange,
    checks: validation?.checks ?? [], payrollWarnings: validation?.warnings ?? row.enrollment.payrollWarnings ?? [],
  };
}

const stale = () => new LoanRequestError(409, "The enrollment changed. Reload it before deciding.");
const preparer = () => new LoanRequestError(403, "A different verifier must review this enrollment. The encoder and latest resubmitter cannot decide it.");
function assertCanDecide(row: Enrollment, revision: number, actor: AgencyActor) {
  if (row.status !== "ENROLLED" || row.revision !== revision) throw stale();
  if (isEnrollmentPreparer(row.enrollment, actor.actorId)) throw preparer();
}

async function verifyEnrollment(row: Enrollment, command: Command, batchKey?: string) {
  const { checks, evidence, openMonth, warnings, code } = await verificationChecks(row, await readRequestDocuments(row.id));
  const blocker = checks.find(check => check.reason);
  if (blocker) throw new LoanRequestError(422, `${blocker.label}. ${blocker.reason}`);
  if (!code) throw new LoanRequestError(422, "Confirm a Payroll agency mapping before verification.");
  const now = new Date().toISOString();
  const enrollment = {
    ...row.enrollment, externalReferenceCheck: "VERIFIED" as const, payrollWarnings: warnings,
    verifiedAt: row.enrollment.verifiedAt ?? now,
    verifiedBy: row.enrollment.verifiedBy ?? { id: command.actor.actorId, name: command.actor.actorName },
  };
  return commitEnrollmentActivation(row, command, code, enrollment, {
    reference: enrollmentListItem(row).reference, evidence, openMonth,
    liveReference: row.live_reference_key, payrollLoanId: row.payroll_loan_id,
    ...(batchKey ? { batchKey } : {}),
  }, now);
}

const decisionInput = z.strictObject({
  expectedRevision: positiveId, decision: z.enum(enrollmentDecisions), reason: z.string().trim().max(500).default(""),
});
const decisionResult = z.object({ status: z.enum(["ACTIVE", "VERIFIED", "RETURNED"]) });

const activationInput = z.strictObject({ expectedRevision: positiveId });
const activationResult = z.object({ status: z.enum(["ACTIVATING", "ACTIVE"]), handoffId: z.uuid(), state: handoffStatus });

export async function activateLoanEnrollment(id: number, body: unknown, key: string | null, actor: AgencyActor) {
  const { expectedRevision } = parseInput(activationInput, body);
  const command = loanCommand(key, { operation: "activate", expectedRevision }, actor, id);
  async function activate() {
    const row = await readStagedEnrollment(id);
    if (row.revision !== expectedRevision || row.status !== "VERIFIED" || !row.enrollment.verifiedAt || !row.enrollment.verifiedBy) {
      throw new LoanRequestError(409, "Choose a verified enrollment awaiting activation.");
    }
    if (isEnrollmentPreparer(row.enrollment, actor.actorId)) throw preparer();
    return verifyEnrollment(row, command);
  }
  const receipt = await readCommandReceipt(command) ?? await activate().catch(async error => {
    const replay = await readCommandReceipt(command);
    if (replay) return replay;
    throw error;
  });
  return { id: receipt.request_id, revision: receipt.revision, ...activationResult.parse(receipt.after_values) };
}

export async function decideEnrollmentVerification(id: number, body: unknown, key: string | null, actor: AgencyActor) {
  const input = parseInput(decisionInput, body);
  if (input.decision === "RETURN" && !input.reason) throw new LoanRequestError(422, "Enter a reason for returning the enrollment.", { reason: "Enter a return reason." });
  const command = loanCommand(key, { operation: "enrollment-verification", ...input }, actor, id);
  async function decide() {
    const row = await readStagedEnrollment(id);
    if (input.decision === "RETURN" && row.status === "ACTIVE" && row.enrollment.priorLoanId) {
      if (row.revision !== input.expectedRevision) throw stale();
      if (isEnrollmentPreparer(row.enrollment, actor.actorId)) throw preparer();
      const month = await readOpenMonth();
      if (!month) throw new LoanRequestError(503, "Set the Government Loans open month before returning a renewal.");
      const period = await nextPeriodCommand(month);
      const [handoff, receipts] = await Promise.all([readPayrollHandoff(id), readMonthReceipts(month)]);
      if (!handoff?.payload.stop || handoff.state !== "QUEUED" || !handoff.delivery.fileExchange ||
        handoff.delivery.lastExportedAt || handoff.delivery.acknowledgements.length ||
        row.enrollment.firstDeductionMonth < month || (row.enrollment.firstDeductionMonth === month && receipts.length)) {
        throw new LoanRequestError(409, "The renewal can only be returned before Payroll delivery and before its effective receipt is confirmed.");
      }
      if (await readOpenMonth() !== month) throw stale();
      return commitRequestRevision(command, "ENROLLMENT_RETURNED", row, {
        status: "RETURNED", enrollment: { ...row.enrollment, returnReason: input.reason },
        payroll_handoffs: { update: [{ id: handoff.id, prior_payroll_loan_id: null, state: "CANCELLED", updated_at: new Date().toISOString() }] },
      }, { status: row.status }, { status: "RETURNED", reason: input.reason, handoffId: handoff.id }, undefined, period);
    }
    assertCanDecide(row, input.expectedRevision, actor);
    if (input.decision === "VERIFY") return verifyEnrollment(row, command);
    const enrollment = { ...row.enrollment, returnReason: input.reason };
    return commitRequestRevision(command, "ENROLLMENT_RETURNED", row, { status: "RETURNED", enrollment },
      { status: row.status }, { status: "RETURNED", reason: input.reason });
  }
  const receipt = await readCommandReceipt(command) ?? await decide().catch(async error => {
    const replay = await readCommandReceipt(command);
    if (replay) return replay;
    throw error;
  });
  return { id: receipt.request_id, revision: receipt.revision, status: decisionResult.parse(receipt.after_values).status };
}

const bulkInput = z.strictObject({ items: z.array(z.strictObject({ id: positiveId, expectedRevision: positiveId }))
  .min(1).max(ENROLLMENT_PAGE_SIZE).refine(items => new Set(items.map(item => item.id)).size === items.length) });
const outcomeRow = z.object({ id: positiveId, reference: z.string(), outcome: z.enum(["verified", "skipped"]), reason: z.string().nullable() });
const batchResult = z.object({ verified: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), items: z.array(outcomeRow) });

async function verifyBatchItem(batch: Command, item: VerificationSelection): Promise<VerificationOutcome> {
  const command = loanCommand(loanCommandPartKey(batch.key, item.id), { operation: "verify-enrollment-item", batch: batch.hash, ...item }, batch.actor, item.id);
  const existing = await readCommandReceipt(command);
  const receipt = existing ?? await (async () => {
    const row = await readStagedEnrollment(item.id).catch(error => {
      if (error instanceof LoanRequestError && error.status === 404) return null;
      throw error;
    });
    if (!row) return null;
    try {
      assertCanDecide(row, item.expectedRevision, batch.actor);
      return await verifyEnrollment(row, command, batch.key);
    } catch (error) {
      const replay = await readCommandReceipt(command);
      if (replay) return replay;
      if (error instanceof LoanRequestError && [403, 409, 422].includes(error.status)) {
        return recordLoanBatchEvent(command, "BULK_VERIFICATION_SKIPPED", row, {
          id: row.id, reference: enrollmentListItem(row).reference, outcome: "skipped", reason: error.message,
        });
      }
      throw error;
    }
  })();
  if (!receipt) return missingOutcome(item.id);
  if (receipt.action === "BULK_VERIFICATION_SKIPPED") return outcomeRow.parse(receipt.after_values);
  const { reference } = z.object({ reference: z.string() }).parse(receipt.after_values);
  return { id: item.id, reference, outcome: "verified", reason: null };
}

const missingOutcome = (id: number): VerificationOutcome => ({ id, reference: String(id), outcome: "skipped", reason: "The enrollment could not be found." });

export async function bulkVerifyEnrollments(body: unknown, key: string | null, actor: AgencyActor): Promise<BulkVerificationResult> {
  const { items } = parseInput(bulkInput, body);
  const batch = loanCommand(key, { operation: "bulk-verify-enrollments", items }, actor);
  const ids = items.map(item => item.id);
  const started = await readCommandReceipt(batch) ?? await (async () => {
    const [anchor] = await readEnrollmentRows(GOVERNMENT_LOAN_REQUESTS, z.object({ id: positiveId, revision: positiveId }),
      "id,revision", { id: { _in: ids }, status: { _in: enrollmentReviewStatuses }, enrollment: { _nnull: true } }, 1, "id");
    return anchor ? recordLoanBatchEvent(batch, "BULK_VERIFICATION_STARTED", anchor, { enrollmentIds: ids }) : null;
  })();
  if (!started) return { verified: 0, skipped: items.length, items: ids.map(missingOutcome) };

  const completion = loanCommand(loanCommandPartKey(batch.key, "result"), { operation: "bulk-verify-result", batch: batch.hash }, actor);
  const existing = await readCommandReceipt(completion);
  if (existing) return batchResult.parse(existing.after_values);
  const outcomes: VerificationOutcome[] = [];
  for (const item of items) outcomes.push(await verifyBatchItem(batch, item));
  const verified = outcomes.filter(item => item.outcome === "verified").length;
  const receipt = await recordLoanBatchEvent(completion, "BULK_VERIFICATION_COMPLETED",
    { id: started.request_id, revision: started.revision }, { verified, skipped: items.length - verified, items: outcomes });
  return batchResult.parse(receipt.after_values);
}
