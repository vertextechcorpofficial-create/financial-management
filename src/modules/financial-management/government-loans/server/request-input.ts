import { z } from "zod";
import { positiveMoney, positiveTerm } from "../requests/request-rules";
import { purposes, type FieldErrors, type RequestForm } from "../requests/types";

export class LoanRequestError extends Error {
  constructor(readonly status: number, message: string, readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}

export const positiveId = z.union([z.number(), z.string().regex(/^[1-9]\d*$/).transform(Number)])
  .pipe(z.number().int().min(1).max(4_294_967_295));
export const pageNumber = z.coerce.number().int().min(1).max(100_000).default(1);
export const flag = z.union([z.boolean(), z.literal(0), z.literal(1), z.literal("0"), z.literal("1"), z.null(),
  z.object({ type: z.literal("Buffer"), data: z.tuple([z.union([z.literal(0), z.literal(1)])]) })])
  .transform(value => value !== null && (typeof value === "object" ? value.data[0] === 1 :
    value === true || value === 1 || value === "1"));
const text = (max: number) => z.string().trim().max(max);

export const requestForm = z.strictObject({
  employeeId: positiveId.nullable(),
  agencyId: positiveId.nullable(),
  program: text(160),
  applicationType: z.enum(["", "NEW", "RENEWAL"]),
  renewalLoanId: positiveId.nullable(),
  amount: text(24),
  term: text(12),
  agencyAmortization: text(24),
  agencyReference: text(120),
  agencyFiledOn: text(10),
  purpose: z.enum(["", ...purposes]),
  payout: text(160),
  remarks: text(500),
  coMakerId: positiveId.nullable(),
  coMakerRelationship: text(160),
  deductionConsent: z.boolean(),
  dataSharingConsent: z.boolean(),
});

export function invalidDraftFields(form: RequestForm): FieldErrors {
  const errors: FieldErrors = {};
  if (form.amount && !positiveMoney(form.amount)) errors.amount = "Enter a positive amount with up to two decimal places.";
  if (form.term && !positiveTerm(form.term)) errors.term = "Enter a positive term in whole months.";
  if (form.agencyAmortization && !positiveMoney(form.agencyAmortization)) errors.agencyAmortization = "Enter a positive amortization with up to two decimal places.";
  if (form.agencyFiledOn && !z.iso.date().safeParse(form.agencyFiledOn).success) errors.agencyFiledOn = "Enter a valid agency filing date.";
  return errors;
}

export const addRequestInput = z.strictObject({ form: requestForm });
export function employeeRequestForm(form: RequestForm, employeeId: number): RequestForm {
  if (form.employeeId !== null && form.employeeId !== employeeId) {
    throw new LoanRequestError(422, "Use your signed-in employee identity.", { employeeId: "This request must be for you." });
  }
  return { ...form, employeeId };
}
export const updateRequestInput = addRequestInput.extend({ expectedRevision: z.number().int().positive() });
export const submitRequestInput = z.strictObject({ expectedRevision: z.number().int().positive() });
export const cancelRequestInput = submitRequestInput.extend({ reason: text(500).optional() });

export function parseInput<T>(schema: z.ZodType<T>, body: unknown) {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const errors = Object.fromEntries(result.error.issues.flatMap(issue => issue.path[0] === "form" && typeof issue.path[1] === "string"
    ? [[issue.path[1], issue.message]] : []));
  throw new LoanRequestError(422, "Check the request fields.", errors);
}
