import "server-only";

import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { deductionMonths, exactMoney, normalizedReference, unusualReference } from "../enrollment/rules";
import {
  enrollmentStatuses, type EnrollmentDetail, type EnrollmentListItem, type EnrollmentOutcome, type EnrollmentPage,
  type EnrollmentSnapshot, type PriorLoan,
} from "../enrollment/types";
import { positiveMoney } from "../requests/request-rules";
import { emptyRequest, type AgencyChoice } from "../requests/types";
import { payrollBenefitCodes, type AgencyActor } from "./agencies";
import { GOVERNMENT_LOAN_REQUESTS, GOVERNMENT_LOAN_SETTINGS, readGovernmentLoansItems, type GovernmentLoansCollection } from "./directus";
import {
  commitRequestRevision, loanCommand, readCommandReceipt, readRequest, referenceFor, requestDetailRow, requestDetails, requestRow,
} from "./loan-requests";
import { activeAgency, activeEmployee, employeeName } from "./request-assessment";
import { LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";

const money = z.string().trim().refine(positiveMoney, "Enter a positive amount with up to two decimal places.").transform(exactMoney);
const terms = z.strictObject({
  agencyReference: z.string().trim().min(1, "Enter the agency reference.").max(120),
  originalPrincipal: money,
  monthlyAmortization: money,
  installmentCount: z.number().int().positive("Enter a positive whole number of installments."),
  installmentsPaid: z.number().int().nonnegative("Enter zero or a positive whole number.").default(0),
  firstDeductionMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a first deduction month."),
  priorLoanId: positiveId.nullable(),
  referenceConfirmed: z.boolean(),
});
const existingInput = z.strictObject({ form: terms.extend({
  employeeId: positiveId, agencyId: positiveId, program: z.string().trim().min(1, "Choose a loan program.").max(160), transfer: z.boolean(),
}) });
const approvedInput = z.strictObject({ form: terms, expectedRevision: z.number().int().positive() });
const snapshot = z.object({ ...terms.shape,
  origin: z.enum(["REQUEST", "EXISTING", "TRANSFER"]),
  externalReferenceCheck: z.enum(["VERIFIED", "NEEDS_SOURCE"]),
  encodedAt: z.string(),
  encodedBy: z.object({ id: positiveId, name: z.string() }),
}).nullable();
const enrollmentStatus = z.enum(enrollmentStatuses);
const listRow = requestRow.pick({ id: true, employee_name: true, agency_name: true, requested_at: true }).extend({
  status: enrollmentStatus, form: z.object({ program: z.string() }), enrollment: snapshot,
});
const detailRow = requestDetailRow.extend({ status: enrollmentStatus, enrollment: snapshot });

async function rows<T>(collection: GovernmentLoansCollection, schema: z.ZodType<T>, fields: string, filter: object,
  limit: number, sort?: string, offset?: number) {
  const query = new URLSearchParams({
    fields, filter: JSON.stringify(filter), limit: String(limit), ...(sort ? { sort } : {}),
    ...(offset !== undefined ? { offset: String(offset) } : {}),
  });
  return z.object({ data: z.array(schema).max(limit) }).parse(await readGovernmentLoansItems(collection, query)).data;
}

async function readOpenMonth() {
  const [row] = await rows(GOVERNMENT_LOAN_SETTINGS, z.object({ open_month: z.string().nullable() }), "open_month", { id: { _eq: 1 } }, 1);
  return row && deductionMonths(row.open_month).length ? row.open_month : null;
}

function listItem(row: z.output<typeof listRow>): EnrollmentListItem {
  return {
    id: row.id, reference: row.requested_at ? referenceFor(row.id) : "GL-" + String(row.id).padStart(6, "0"),
    status: row.status, employeeName: row.employee_name, agencyName: row.agency_name,
    program: row.form.program, enrollment: row.enrollment,
  };
}

const listInput = z.object({
  q: z.string().trim().max(120).default(""), agency: positiveId.optional(),
  status: z.enum(["APPROVED", "ENROLLED"]).optional(), page: pageNumber,
});
export async function listLoanEnrollments(params: URLSearchParams): Promise<EnrollmentPage> {
  const { q, agency, status, page } = parseInput(listInput, Object.fromEntries(params));
  const systemRef = /^(?:GLR?-)?0*([1-9]\d{0,9})$/i.exec(q)?.[1];
  const filter = {
    ...(status ? { status: { _eq: status } } : {}), ...(agency ? { agency_id: { _eq: agency } } : {}),
    _and: [
      { _or: [
        { status: { _eq: "APPROVED" }, requested_at: { _nnull: true } },
        { status: { _eq: "ENROLLED" }, live_reference_key: { _nnull: true } },
      ] },
      ...(q ? [{ _or: [
        { employee_name: { _icontains: q } }, { live_reference_key: { _icontains: q } },
        ...(systemRef ? [{ id: { _eq: Number(systemRef) } }] : []),
      ] }] : []),
    ],
  };
  const limit = 25;
  const [matches, openMonth] = await Promise.all([
    rows(GOVERNMENT_LOAN_REQUESTS, listRow, Object.keys(listRow.shape).join(","), filter, limit + 1, "-updated_at,-id", (page - 1) * limit),
    readOpenMonth(),
  ]);
  return { items: matches.slice(0, limit).map(listItem), hasMore: matches.length > limit, openMonth };
}

export async function getLoanEnrollment(id: number): Promise<EnrollmentDetail> {
  const [row] = await rows(GOVERNMENT_LOAN_REQUESTS, detailRow, Object.keys(detailRow.shape).join(","), {
    id: { _eq: id }, status: { _in: enrollmentStatuses },
  }, 1);
  if (!row || (row.status === "ENROLLED" ? !row.enrollment : !row.requested_at)) {
    throw new LoanRequestError(404, "Loan enrollment could not be found.");
  }
  return { ...listItem(row), request: await requestDetails(row) };
}

const idRow = z.object({ id: positiveId });
async function referenceReserved(reference: string, exclude?: number) {
  const matches = await rows(GOVERNMENT_LOAN_REQUESTS, idRow, "id", {
    live_reference_key: { _eq: reference }, ...(exclude === undefined ? {} : { id: { _neq: exclude } }),
  }, 1);
  return matches.length > 0;
}

const payrollReference = z.object({ reference_no: z.string().nullable() });
const mappedCodes = [...new Set(payrollBenefitCodes.values())];
async function payrollHasReference(reference: string) {
  const limit = 25;
  const filter = {
    benefit_code: { _in: mappedCodes }, reference_no: { _icontains: reference },
    _or: [{ status: { _nin: ["CLOSED", "CANCELLED"] } }, { status: { _null: true } }],
  };
  try {
    for (let offset = 0; ; offset += limit) {
      const batch = await rows("benefit_loans", payrollReference, "reference_no", filter, limit, "loan_id", offset);
      if (batch.some(row => row.reference_no && normalizedReference(row.reference_no) === reference)) return true;
      if (batch.length < limit) return false;
    }
  } catch {
    throw new LoanRequestError(503, "Could not check live Payroll references. Try again.");
  }
}

const priorRow = payrollReference.extend({ loan_id: positiveId, loan_name: z.string().nullable() });
const benefitCode = (agency: AgencyChoice) => agency.agencyType === "GOVERNMENT" ? payrollBenefitCodes.get(agency.shortCode) : undefined;
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

async function validatePriorLoan(id: number, employeeId: number, code: string | undefined) {
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

export async function saveLoanEnrollment(body: unknown, key: string | null, actor: AgencyActor, id?: number) {
  const input = id === undefined
    ? { path: "existing" as const, ...parseInput(existingInput, body) }
    : { path: "approved" as const, id, ...parseInput(approvedInput, body) };
  const command = loanCommand(key, { operation: "enroll", ...input }, actor, id);
  return runOutcome(command, async () => {
    const current = input.path === "approved" ? await approvedRequest(input.id, input.expectedRevision) : null;
    const selection = input.path === "existing" ? input.form : current!.form;
    const form = input.form;
    if (form.installmentsPaid >= form.installmentCount) {
      throw new LoanRequestError(422, "Check the installment counts.", { installmentsPaid: "Installments already paid must be below the total." });
    }
    if (current?.form.applicationType === "RENEWAL" && !form.priorLoanId) {
      throw new LoanRequestError(422, "Choose the prior loan for this renewal.", { priorLoanId: "Choose an active prior loan." });
    }
    const [openMonth, agency, employee] = await Promise.all([
      readOpenMonth(), activeAgency(selection.agencyId), activeEmployee(selection.employeeId, todayManila()),
    ]);
    if (!openMonth) throw new LoanRequestError(503, "Set the Government Loans open month before saving an enrollment.");
    const allowedMonths = deductionMonths(openMonth);
    if (!allowedMonths.includes(form.firstDeductionMonth)) {
      throw new LoanRequestError(422, "Choose a first deduction month in the current enrollment window.", {
        firstDeductionMonth: "Choose a month from " + allowedMonths[0] + " through " + allowedMonths[3] + ".",
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
    if (await referenceReserved(reference, id) || await payrollHasReference(reference)) throw duplicateReference();
    const code = benefitCode(agency);
    if (form.priorLoanId) await validatePriorLoan(form.priorLoanId, employee.user_id, code);

    const now = new Date().toISOString();
    const enrollment: EnrollmentSnapshot = {
      agencyReference: form.agencyReference, originalPrincipal: form.originalPrincipal, monthlyAmortization: form.monthlyAmortization,
      installmentCount: form.installmentCount, installmentsPaid: form.installmentsPaid, firstDeductionMonth: form.firstDeductionMonth,
      priorLoanId: form.priorLoanId, referenceConfirmed: unusual && form.referenceConfirmed,
      origin: input.path === "approved" ? "REQUEST" : input.form.transfer ? "TRANSFER" : "EXISTING",
      externalReferenceCheck: code ? "VERIFIED" : "NEEDS_SOURCE",
      encodedBy: { id: actor.actorId, name: actor.actorName }, encodedAt: now,
    };
    const state = { status: "ENROLLED", enrollment, live_reference_key: reference };
    const initial = current ? {} : {
      form: { ...emptyRequest, employeeId: employee.user_id, agencyId: agency.id, program: selection.program },
      employee_user_id: employee.user_id, employee_name: employeeName(employee), agency_id: agency.id, agency_name: agency.name,
      missing_fields: {}, created_by_user_id: actor.actorId, created_at: now,
    };
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
