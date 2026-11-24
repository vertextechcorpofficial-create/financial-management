import "server-only";

import { z } from "zod";
import { matchPayrollEnrollment } from "../enrollment/payroll-match";
import { normalizedReference } from "../enrollment/rules";
import { enrollmentReviewStatuses } from "../enrollment/types";
import { canStartInOpenPeriod, isEnrollmentPreparer, needsImportTransferChoice, requiredEnrollmentEvidence } from "../enrollment/verification-rules";
import {
  ENROLLMENT_PAGE_SIZE, enrollmentDecisions, type BulkVerificationResult, type VerificationOutcome,
  type VerificationQueue, type VerificationReview, type VerificationSelection,
} from "../enrollment/verification-types";
import { enrollmentEvidenceKinds } from "../requests/types";
import type { AgencyActor } from "./agencies";
import { GOVERNMENT_LOAN_REQUESTS } from "./directus";
import {
  enrollmentBenefitCode, readEnrollmentRows, readLinkedPayrollLoans, readPayrollReferences, readReservedReferences,
} from "./enrollment-sources";
import {
  enrollmentDetail, enrollmentListItem, listEnrollmentRecords, readOpenMonth, readStagedEnrollment, validatePriorLoan,
} from "./loan-enrollment";
import {
  commitRequestRevision, loanCommand, loanCommandPartKey, readCommandReceipt, readLoanDocuments,
  readRequestDocuments, recordLoanBatchEvent, type StoredLoanDocument,
} from "./loan-requests";
import { activeAgency } from "./request-assessment";
import { LoanRequestError, parseInput, positiveId } from "./request-input";

type Enrollment = Awaited<ReturnType<typeof readStagedEnrollment>>;
type Command = ReturnType<typeof loanCommand>;

export async function listEnrollmentVerification(params: URLSearchParams, actor: AgencyActor): Promise<VerificationQueue> {
  const filters = new URLSearchParams(params);
  filters.set("status", "ENROLLED");
  const [result, openMonth] = await Promise.all([listEnrollmentRecords(filters), readOpenMonth()]);
  const documents = await readLoanDocuments(result.items.map(row => row.id));
  return { hasMore: result.hasMore, openMonth, items: result.items.flatMap(row => {
    const enrollment = row.enrollment;
    if (!enrollment) return [];
    const required = requiredEnrollmentEvidence(enrollment, row.form.applicationType === "RENEWAL");
    return [{
      ...enrollmentListItem(row), enrollment, revision: row.revision,
      canDecide: !isEnrollmentPreparer(enrollment, actor.actorId),
      documentsPresent: required.filter(kind => documents.some(file => file.request_id === row.id && file.kind === kind)).length,
      documentsRequired: required.length,
    }];
  }) };
}

async function checkLiveReference(row: Enrollment) {
  const { employeeId, agencyId, program } = row.form;
  const reference = normalizedReference(row.enrollment.agencyReference);
  const agency = await activeAgency(agencyId);
  if (!employeeId || !agency || !agency.programs.includes(program)) {
    throw new LoanRequestError(422, "Confirm the employee and active agency program before verification.");
  }
  const code = enrollmentBenefitCode(agency);
  if (!code) throw new LoanRequestError(422, "Confirm a Payroll agency mapping before verification.");
  const [reservations, references, owners] = await Promise.all([
    readReservedReferences([reference]), readPayrollReferences([reference]),
    row.payroll_loan_id ? readLinkedPayrollLoans([row.payroll_loan_id]) : [],
  ]);
  if (row.live_reference_key !== reference || reservations.some(item => item.id !== row.id)) {
    throw new LoanRequestError(422, "The agency reference is already in use or its reservation changed. Return the enrollment for correction.");
  }
  const match = matchPayrollEnrollment(references.get(reference) ?? [], { ...row.enrollment, employeeId, program }, code, Boolean(row.payroll_loan_id));
  if (match.conflict) throw new LoanRequestError(422, match.conflict);
  if (match.loanId !== row.payroll_loan_id || (row.enrollment.payrollLoanId ?? null) !== row.payroll_loan_id || owners.some(item => item.id !== row.id)) {
    throw new LoanRequestError(422, "The linked Payroll loan changed or is already linked elsewhere. Return the enrollment for correction.");
  }
  if (row.enrollment.priorLoanId) {
    if (row.enrollment.priorLoanId === row.payroll_loan_id) {
      throw new LoanRequestError(422, "Choose a prior loan distinct from the enrollment's Payroll loan.");
    }
    await validatePriorLoan(row.enrollment.priorLoanId, employeeId, code);
  }
  return match.warnings;
}

async function verificationChecks(row: Enrollment, documents: StoredLoanDocument[]) {
  const [openMonth, payroll] = await Promise.all([
    readOpenMonth().catch(() => null),
    checkLiveReference(row).then(warnings => ({ warnings, reason: null })).catch(error => ({
      warnings: [], reason: error instanceof LoanRequestError ? error.message : "Could not check the current agency reference. Try again.",
    })),
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
  }
  checks.push({
    label: "First deduction month",
    reason: !openMonth ? "The current open month could not be confirmed." :
      canStartInOpenPeriod(row.enrollment.firstDeductionMonth, openMonth) ? null : `Choose a first deduction month of ${openMonth} or later.`,
  }, { label: "Live reference and Payroll mapping", reason: payroll.reason });
  return { checks, evidence, openMonth, warnings: payroll.warnings };
}

export async function getEnrollmentVerification(id: number, actor: AgencyActor): Promise<VerificationReview> {
  const row = await readStagedEnrollment(id);
  const documents = await readRequestDocuments(id);
  const [record, validation] = await Promise.all([
    enrollmentDetail(row, documents), row.status === "ENROLLED" ? verificationChecks(row, documents) : null,
  ]);
  return {
    record: { ...record, enrollment: row.enrollment },
    canDecide: row.status === "ENROLLED" && !isEnrollmentPreparer(row.enrollment, actor.actorId),
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
  const { checks, evidence, openMonth, warnings } = await verificationChecks(row, await readRequestDocuments(row.id));
  const blocker = checks.find(check => check.reason);
  if (blocker) throw new LoanRequestError(422, `${blocker.label}. ${blocker.reason}`);
  const now = new Date().toISOString();
  const enrollment = {
    ...row.enrollment, externalReferenceCheck: "VERIFIED", payrollWarnings: warnings,
    verifiedAt: now, verifiedBy: { id: command.actor.actorId, name: command.actor.actorName },
  };
  return commitRequestRevision(command, "ENROLLMENT_VERIFIED", row, { status: "VERIFIED", enrollment },
    { status: row.status }, {
      status: "VERIFIED", reference: enrollmentListItem(row).reference, enrollment, evidence, openMonth,
      liveReference: row.live_reference_key, payrollLoanId: row.payroll_loan_id,
      ...(batchKey ? { batchKey } : {}),
    }, now);
}

const decisionInput = z.strictObject({
  expectedRevision: positiveId, decision: z.enum(enrollmentDecisions), reason: z.string().trim().max(500).default(""),
});
const decisionResult = z.object({ status: z.enum(["VERIFIED", "RETURNED"]) });

export async function decideEnrollmentVerification(id: number, body: unknown, key: string | null, actor: AgencyActor) {
  const input = parseInput(decisionInput, body);
  if (input.decision === "RETURN" && !input.reason) throw new LoanRequestError(422, "Enter a reason for returning the enrollment.", { reason: "Enter a return reason." });
  const command = loanCommand(key, { operation: "enrollment-verification", ...input }, actor, id);
  async function decide() {
    const row = await readStagedEnrollment(id);
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
