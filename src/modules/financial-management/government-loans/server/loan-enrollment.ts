import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { deductionMonths, exactMoney, normalizedReference, unusualReference } from "../enrollment/rules";
import { matchPayrollEnrollment } from "../enrollment/payroll-match";
import {
  enrollmentReviewStatuses, enrollmentStatuses, type EnrollmentDetail, type EnrollmentListItem, type EnrollmentOutcome, type EnrollmentPage,
  type EnrollmentSnapshot, type EnrollmentTerms, type ExistingLoanReview, type PriorLoan,
} from "../enrollment/types";
import { canStartInOpenPeriod } from "../enrollment/verification-rules";
import { ENROLLMENT_PAGE_SIZE } from "../enrollment/verification-types";
import { positiveMoney } from "../requests/request-rules";
import { emptyRequest, type AgencyChoice } from "../requests/types";
import type { AgencyActor } from "./agencies";
import { GOVERNMENT_LOAN_REQUESTS, GOVERNMENT_LOAN_SETTINGS } from "./directus";
import {
  enrollmentBenefitCode as benefitCode, readEnrollmentRows as rows, readLinkedPayrollLoans, readPayrollReferences, readReservedReferences,
} from "./enrollment-sources";
import {
  commitRequestRevision, enrollmentEvidenceKind, loanCommand, readCommandReceipt, readRequest, readRequestDocuments,
  referenceFor, requestDetailRow, requestDetails, requestRow, type StoredLoanDocument,
} from "./loan-requests";
import { activeAgency, activeEmployee, employeeName } from "./request-assessment";
import { LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";

const money = z.string().trim().refine(positiveMoney, "Enter a positive amount with up to two decimal places.").transform(exactMoney);
export const enrollmentTerms = z.strictObject({
  agencyReference: z.string().trim().min(1, "Enter the agency reference.").max(120),
  originalPrincipal: money,
  monthlyAmortization: money,
  installmentCount: z.number().int().positive("Enter a positive whole number of installments."),
  installmentsPaid: z.number().int().nonnegative("Enter zero or a positive whole number.").default(0),
  firstDeductionMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a first deduction month."),
  priorLoanId: positiveId.nullable(),
  referenceConfirmed: z.boolean(),
});
const existingForm = enrollmentTerms.extend({
  employeeId: positiveId, agencyId: positiveId, program: z.string().trim().min(1, "Choose a loan program.").max(160), transfer: z.boolean(),
});
const existingInput = z.strictObject({ form: existingForm, previewToken: z.string().regex(/^[a-f0-9]{64}$/).optional() });
const approvedInput = z.strictObject({ form: enrollmentTerms, expectedRevision: z.number().int().positive() });
const staff = z.object({ id: positiveId, name: z.string() });
const snapshot = z.object({ ...enrollmentTerms.shape,
  origin: z.enum(["REQUEST", "EXISTING", "TRANSFER", "IMPORT"]),
  externalReferenceCheck: z.enum(["VERIFIED", "NEEDS_SOURCE"]),
  encodedAt: z.string(),
  encodedBy: staff,
  payrollLoanId: positiveId.nullable().optional(),
  payrollWarnings: z.array(z.string()).optional(),
  sourceRow: z.number().int().positive().optional(),
  importTransfer: z.boolean().optional(),
  resubmittedBy: staff.optional(),
  resubmittedAt: z.string().optional(),
  returnReason: z.string().optional(),
  verifiedBy: staff.optional(),
  verifiedAt: z.string().optional(),
}).nullable();
const enrollmentStatus = z.enum(enrollmentStatuses);
const reviewStatus = z.enum(enrollmentReviewStatuses);
const listRow = requestRow.pick({ id: true, revision: true, employee_name: true, agency_name: true, requested_at: true }).extend({
  status: enrollmentStatus, form: z.object({ program: z.string(), applicationType: z.string() }),
  enrollment: snapshot, import_batch_id: positiveId.nullable(),
});
const detailRow = requestDetailRow.extend({
  status: enrollmentStatus, enrollment: snapshot, import_batch_id: positiveId.nullable(),
  live_reference_key: z.string().nullable(), payroll_loan_id: positiveId.nullable(),
});
export type EnrollmentRecord = z.output<typeof detailRow>;

export async function readOpenMonth() {
  const [row] = await rows(GOVERNMENT_LOAN_SETTINGS, z.object({ open_month: z.string().nullable() }), "open_month", { id: { _eq: 1 } }, 1);
  return row && deductionMonths(row.open_month).length ? row.open_month : null;
}

export function enrollmentListItem(row: z.output<typeof listRow>): EnrollmentListItem {
  return {
    id: row.id, reference: row.requested_at ? referenceFor(row.id) : "GL-" + String(row.id).padStart(6, "0"),
    status: row.status, employeeName: row.employee_name, agencyName: row.agency_name,
    program: row.form.program, enrollment: row.enrollment, importBatchId: row.import_batch_id,
  };
}

const listInput = z.object({
  q: z.string().trim().max(120).default(""), agency: positiveId.optional(),
  status: z.enum(["APPROVED", ...enrollmentReviewStatuses]).optional(), batch: positiveId.optional(), page: pageNumber,
});
export async function listEnrollmentRecords(params: URLSearchParams) {
  const { q, agency, status, batch, page } = parseInput(listInput, Object.fromEntries(params));
  const systemRef = /^(?:GLR?-)?0*([1-9]\d{0,9})$/i.exec(q)?.[1];
  const filter = {
    ...(status ? { status: { _eq: status } } : {}), ...(agency ? { agency_id: { _eq: agency } } : {}),
    ...(batch ? { import_batch_id: { _eq: batch } } : {}),
    _and: [
      { _or: [
        { status: { _eq: "APPROVED" }, requested_at: { _nnull: true } },
        { status: { _in: enrollmentReviewStatuses }, enrollment: { _nnull: true } },
      ] },
      ...(q ? [{ _or: [
        { employee_name: { _icontains: q } }, { live_reference_key: { _icontains: q } },
        ...(systemRef ? [{ id: { _eq: Number(systemRef) } }] : []),
      ] }] : []),
    ],
  };
  const limit = ENROLLMENT_PAGE_SIZE;
  const matches = await rows(GOVERNMENT_LOAN_REQUESTS, listRow, Object.keys(listRow.shape).join(","), filter,
    limit + 1, "-updated_at,-id", (page - 1) * limit);
  return { items: matches.slice(0, limit), hasMore: matches.length > limit };
}

export async function listLoanEnrollments(params: URLSearchParams): Promise<EnrollmentPage> {
  const [result, openMonth] = await Promise.all([listEnrollmentRecords(params), readOpenMonth()]);
  return { ...result, items: result.items.map(enrollmentListItem), openMonth };
}

async function readEnrollmentRecord(id: number): Promise<EnrollmentRecord> {
  const [row] = await rows(GOVERNMENT_LOAN_REQUESTS, detailRow, Object.keys(detailRow.shape).join(","), {
    id: { _eq: id }, status: { _in: enrollmentStatuses },
  }, 1);
  if (!row || (reviewStatus.safeParse(row.status).success ? !row.enrollment : !row.requested_at)) {
    throw new LoanRequestError(404, "Loan enrollment could not be found.");
  }
  return row;
}

export async function readStagedEnrollment(id: number) {
  const row = await readEnrollmentRecord(id);
  if (!row.enrollment || !reviewStatus.safeParse(row.status).success) throw new LoanRequestError(404, "Loan enrollment could not be found.");
  return { ...row, enrollment: row.enrollment };
}

export async function enrollmentDetail(row: EnrollmentRecord, documents: StoredLoanDocument[]): Promise<EnrollmentDetail> {
  return {
    ...enrollmentListItem(row), request: await requestDetails(row, documents),
    evidence: row.enrollment ? documents.flatMap(document => {
      const kind = enrollmentEvidenceKind.safeParse(document.kind);
      return kind.success ? [{ kind: kind.data, name: document.file_name }] : [];
    }) : [],
  };
}

export async function getLoanEnrollment(id: number): Promise<EnrollmentDetail> {
  const row = await readEnrollmentRecord(id);
  return enrollmentDetail(row, await readRequestDocuments(id));
}

async function referenceReserved(reference: string, exclude?: number) {
  return (await readReservedReferences([reference])).some(row => row.id !== exclude);
}

const payrollReference = z.object({ reference_no: z.string().nullable() });
const priorRow = payrollReference.extend({ loan_id: positiveId, loan_name: z.string().nullable() });
const priorFilter = (employeeId: number, code: string) => ({
  user_id: { _eq: employeeId }, benefit_code: { _eq: code }, status: { _eq: "ACTIVE" }, remaining_balance: { _gt: 0 },
});
const priorQuery = z.object({ employeeId: positiveId, agencyId: positiveId });
export async function listPriorLoans(params: URLSearchParams): Promise<{ items: PriorLoan[]; supported: boolean }> {
  const { employeeId, agencyId } = parseInput(priorQuery, Object.fromEntries(params));
  const agency = await activeAgency(agencyId);
  if (!agency) throw new LoanRequestError(422, "Choose an active agency or lender.");
  const code = benefitCode(agency);
  if (!code) return { items: [], supported: false };
  const filter = priorFilter(employeeId, code);
  const items: PriorLoan[] = [];
  const limit = 25;
  try {
    for (let offset = 0; ; offset += limit) {
      const batch = await rows("benefit_loans", priorRow, "loan_id,loan_name,reference_no", filter, limit, "loan_id", offset);
      items.push(...batch.map(row => ({ id: row.loan_id, program: row.loan_name, reference: row.reference_no })));
      if (batch.length < limit) return { items, supported: true };
    }
  } catch {
    throw new LoanRequestError(503, "Could not check prior Payroll loans. Try again.");
  }
}

export async function validatePriorLoan(id: number, employeeId: number, code: string | undefined) {
  if (!code) throw new LoanRequestError(422, "Verify the Payroll loan source before enrolling a renewal.");
  const [match] = await rows("benefit_loans", z.object({ loan_id: positiveId }), "loan_id", {
    loan_id: { _eq: id }, ...priorFilter(employeeId, code),
  }, 1).catch(() => { throw new LoanRequestError(503, "Could not verify the prior Payroll loan. Try again."); });
  if (!match) throw new LoanRequestError(422, "Choose a live prior loan for this employee and agency.", {
    priorLoanId: "Choose a live prior loan for this employee and agency.",
  });
}

type Command = ReturnType<typeof loanCommand>;
type Receipt = Awaited<ReturnType<typeof commitRequestRevision>>;
const resultStatus = z.object({ status: z.enum(["ENROLLED", "AGENCY_DECLINED"]) });
function outcome(receipt: Receipt): EnrollmentOutcome {
  return { id: receipt.request_id, revision: receipt.revision, status: resultStatus.parse(receipt.after_values).status };
}

async function runOutcome(command: Command, commit: () => Promise<Receipt>) {
  const receipt = await readCommandReceipt(command);
  if (receipt) return outcome(receipt);
  try {
    return outcome(await commit());
  } catch (error) {
    if (error instanceof LoanRequestError && error.status === 409) {
      const replay = await readCommandReceipt(command);
      if (replay) return outcome(replay);
    }
    throw error;
  }
}

async function approvedRequest(id: number, revision: number) {
  const row = await readRequest(id);
  if (row.status !== "APPROVED" || !row.requested_at || row.revision !== revision) {
    throw new LoanRequestError(409, "This request is no longer approved and awaiting an agency outcome. Reload it to see its current status.");
  }
  return row;
}

const duplicateReference = () => new LoanRequestError(409, "The agency reference is already used by a live loan.", {
  agencyReference: "Enter the reference for this loan from the agency notice.",
});

async function validateEnrollment(form: EnrollmentTerms, selection: { agencyId: number | null; employeeId: number | null; program: string },
  id?: number, origin: EnrollmentSnapshot["origin"] = id === undefined ? "EXISTING" : "REQUEST") {
  if (form.installmentsPaid >= form.installmentCount) {
    throw new LoanRequestError(422, "Check the installment counts.", { installmentsPaid: "Installments already paid must be below the total." });
  }
  const [openMonth, agency, employee] = await Promise.all([
    readOpenMonth(), activeAgency(selection.agencyId), activeEmployee(selection.employeeId, todayManila()),
  ]);
  if (!openMonth) throw new LoanRequestError(503, "Set the Government Loans open month before saving an enrollment.");
  const allowedMonths = deductionMonths(openMonth);
  if (origin === "IMPORT" ? !canStartInOpenPeriod(form.firstDeductionMonth, openMonth) : !allowedMonths.includes(form.firstDeductionMonth)) {
    throw new LoanRequestError(422, "Choose a first deduction month in the current enrollment window.", {
      firstDeductionMonth: origin === "IMPORT" ? "Choose " + openMonth + " or later." :
        "Choose a month from " + allowedMonths[0] + " through " + allowedMonths[3] + ".",
    });
  }
  if (!employee) throw new LoanRequestError(422, "Choose an active employee.", { employeeId: "The employee is unavailable for enrollment." });
  if (!agency) throw new LoanRequestError(422, "Choose an active agency or lender.", { agencyId: "This agency is unavailable for enrollment." });
  if (!agency.programs.includes(selection.program)) {
    throw new LoanRequestError(422, "Choose a program for the selected agency.", { program: "This program is unavailable for enrollment." });
  }
  const unusual = unusualReference(agency.shortCode, form.agencyReference);
  if (unusual && !form.referenceConfirmed) {
    throw new LoanRequestError(422, "The agency reference has an unusual format.", { referenceConfirmed: "Confirm that the reference is correct as printed." });
  }
  const reference = normalizedReference(form.agencyReference);
  const [reserved, matches] = await Promise.all([referenceReserved(reference, id), readPayrollReferences([reference])]);
  if (reserved) throw duplicateReference();
  const code = benefitCode(agency);
  const match = matchPayrollEnrollment(matches.get(reference) ?? [], {
    ...form, employeeId: employee.user_id, program: selection.program,
  }, code, origin !== "REQUEST");
  if (match.conflict) throw new LoanRequestError(409, match.conflict, { agencyReference: match.conflict });
  if (match.loanId && (await readLinkedPayrollLoans([match.loanId])).some(row => row.id !== id)) {
    throw new LoanRequestError(409, "This Payroll loan is already linked to a VOS enrollment.", { agencyReference: "Choose a loan that has not been enrolled." });
  }
  if (form.priorLoanId) {
    if (form.priorLoanId === match.loanId) {
      throw new LoanRequestError(422, "Choose a different prior loan for the renewal.", { priorLoanId: "The linked loan and prior loan must be different." });
    }
    await validatePriorLoan(form.priorLoanId, employee.user_id, code);
  }
  const pending = !code;
  const warnings = pending ? ["External reference check pending."] : match.warnings;
  const token = createHash("sha256").update(JSON.stringify([form, openMonth, employee.user_id, agency.id, selection.program, match.loanId, warnings])).digest("hex");
  return { employee, agency, reference, unusual, pending, match, review: { payrollLoanId: match.loanId, warnings, token } };
}

export async function previewExistingLoan(body: unknown): Promise<ExistingLoanReview> {
  const { form } = parseInput(existingInput, body);
  return (await validateEnrollment(form, form)).review;
}

export function enrollmentState(enrollment: EnrollmentSnapshot) {
  return {
    status: "ENROLLED",
    enrollment,
    live_reference_key: normalizedReference(enrollment.agencyReference),
    ...(enrollment.payrollLoanId ? { payroll_loan_id: enrollment.payrollLoanId } : {}),
  };
}

export function standaloneEnrollmentValues(employee: { id: number; name: string }, agency: Pick<AgencyChoice, "id" | "name">,
  program: string, actor: AgencyActor, now: string) {
  return {
    form: { ...emptyRequest, employeeId: employee.id, agencyId: agency.id, program },
    employee_user_id: employee.id, employee_name: employee.name, agency_id: agency.id, agency_name: agency.name,
    missing_fields: {}, created_by_user_id: actor.actorId, created_at: now,
  };
}

export async function saveLoanEnrollment(body: unknown, key: string | null, actor: AgencyActor, id?: number) {
  const input = id === undefined
    ? { path: "existing" as const, ...parseInput(existingInput, body) }
    : { path: "approved" as const, id, ...parseInput(approvedInput, body) };
  const command = loanCommand(key, { operation: "enroll", ...input }, actor, id);
  return runOutcome(command, async () => {
    const current = input.path === "approved" ? await approvedRequest(input.id, input.expectedRevision) : null;
    const selection = input.path === "existing" ? input.form : current!.form;
    const form = input.form;
    if (current?.form.applicationType === "RENEWAL" && !form.priorLoanId) {
      throw new LoanRequestError(422, "Choose the prior loan for this renewal.", { priorLoanId: "Choose an active prior loan." });
    }
    const { employee, agency, reference, unusual, pending, match, review } = await validateEnrollment(form, selection, id);
    if (input.path === "existing" && input.previewToken && input.previewToken !== review.token) {
      throw new LoanRequestError(409, "The loan details or Payroll match changed. Review the enrollment again.");
    }

    const now = new Date().toISOString();
    const enrollment: EnrollmentSnapshot = {
      agencyReference: form.agencyReference, originalPrincipal: form.originalPrincipal, monthlyAmortization: form.monthlyAmortization,
      installmentCount: form.installmentCount, installmentsPaid: form.installmentsPaid, firstDeductionMonth: form.firstDeductionMonth,
      priorLoanId: form.priorLoanId, referenceConfirmed: unusual && form.referenceConfirmed,
      origin: input.path === "approved" ? "REQUEST" : input.form.transfer ? "TRANSFER" : "EXISTING",
      externalReferenceCheck: pending ? "NEEDS_SOURCE" : "VERIFIED",
      encodedBy: { id: actor.actorId, name: actor.actorName }, encodedAt: now,
      ...(match.loanId ? { payrollLoanId: match.loanId, payrollWarnings: match.warnings } : {}),
    };
    const state = enrollmentState(enrollment);
    const initial = current ? {} : standaloneEnrollmentValues({ id: employee.user_id, name: employeeName(employee) }, agency, selection.program, actor, now);
    try {
      return await commitRequestRevision(command, "REQUEST_ENROLLED", current, { ...initial, ...state },
        current ? { status: "APPROVED" } : null, { status: "ENROLLED", enrollment }, now);
    } catch (error) {
      if (error instanceof LoanRequestError && error.status === 409 && await referenceReserved(reference, id)) {
        throw duplicateReference();
      }
      throw error;
    }
  });
}

export async function resubmitLoanEnrollment(id: number, body: unknown, key: string | null, actor: AgencyActor) {
  const input = parseInput(approvedInput, body);
  const command = loanCommand(key, { operation: "resubmit-enrollment", ...input }, actor, id);
  return runOutcome(command, async () => {
    const row = await readStagedEnrollment(id);
    if (row.status !== "RETURNED" || row.revision !== input.expectedRevision) {
      throw new LoanRequestError(409, "Reload the returned enrollment before resubmitting.");
    }
    if (row.form.applicationType === "RENEWAL" && !input.form.priorLoanId) {
      throw new LoanRequestError(422, "Choose the prior loan for this renewal.", { priorLoanId: "Choose an active prior loan." });
    }
    const { pending, match, unusual } = await validateEnrollment(input.form, row.form, id, row.enrollment.origin);
    const now = new Date().toISOString();
    const enrollment: EnrollmentSnapshot = {
      ...row.enrollment, ...input.form, referenceConfirmed: unusual && input.form.referenceConfirmed,
      externalReferenceCheck: pending ? "NEEDS_SOURCE" : "VERIFIED",
      payrollLoanId: match.loanId, payrollWarnings: match.warnings,
      resubmittedBy: { id: actor.actorId, name: actor.actorName }, resubmittedAt: now,
    };
    return commitRequestRevision(command, "ENROLLMENT_RESUBMITTED", row,
      { ...enrollmentState(enrollment), payroll_loan_id: match.loanId },
      { status: row.status, enrollment: row.enrollment }, { status: "ENROLLED", enrollment }, now);
  });
}

const transferInput = z.strictObject({ expectedRevision: positiveId, transfer: z.boolean() });
export async function recordImportTransfer(id: number, body: unknown, key: string | null, actor: AgencyActor) {
  const input = parseInput(transferInput, body);
  const command = loanCommand(key, { operation: "record-import-transfer", ...input }, actor, id);
  const replay = await readCommandReceipt(command);
  if (replay) return { id, revision: replay.revision };
  const row = await readStagedEnrollment(id);
  if (row.status === "VERIFIED" || row.revision !== input.expectedRevision) {
    throw new LoanRequestError(409, "Reload the enrollment before updating its transfer status.");
  }
  if (row.enrollment.origin !== "IMPORT" || row.enrollment.installmentsPaid !== 0) {
    throw new LoanRequestError(422, "Transfer classification applies to imports with zero paid installments.");
  }
  const receipt = await commitRequestRevision(command, "ENROLLMENT_TRANSFER_RECORDED", row,
    { enrollment: { ...row.enrollment, importTransfer: input.transfer } },
    { status: row.status, importTransfer: row.enrollment.importTransfer ?? null },
    { status: row.status, importTransfer: input.transfer });
  return { id, revision: receipt.revision };
}

const declineInput = approvedInput.pick({ expectedRevision: true }).extend({
  reason: z.string().trim().max(500),
});
export async function declineLoanEnrollment(id: number, body: unknown, key: string | null, actor: AgencyActor) {
  const { expectedRevision, reason } = parseInput(declineInput, body);
  if (!reason) throw new LoanRequestError(422, "Enter the agency's reason or reference.");
  const command = loanCommand(key, { operation: "agency-decline", expectedRevision, reason }, actor, id);
  return runOutcome(command, async () => {
    const current = await approvedRequest(id, expectedRevision);
    return commitRequestRevision(command, "REQUEST_AGENCY_DECLINED", current, { status: "AGENCY_DECLINED" },
      { status: "APPROVED" }, { status: "AGENCY_DECLINED", reason });
  });
}
