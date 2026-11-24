import { z } from "zod";

import {
  BUSINESS_DAY_RULES,
  DST_TREATMENTS,
  FIRST_PERIOD_BASES,
  LENDER_TYPES,
  PAS23_TYPES,
  PAYMENT_FREQUENCIES,
  RATE_TYPES,
  REPAYMENT_METHODS,
  SECURITIES,
} from "./constants";
import { phtToday } from "./pht";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MONEY = 9_999_999_999_999;

function oneOf(values: readonly string[], message: string) {
  return z.string().refine((value) => values.includes(value), message);
}

const dateOnly = z.string().regex(DATE_PATTERN, "Choose a date.");

/** The route body: trusted shapes only, and the money that the engine derives is not accepted here. */
export const loanBodySchema = z
  .object({
    lenderName: z.string().trim().min(1).max(191),
    lenderType: oneOf(LENDER_TYPES, "Choose the lender type."),
    branch: z.string().trim().max(120).nullable().optional(),
    accountOfficer: z.string().trim().max(120).nullable().optional(),
    contactPhone: z.string().trim().max(40).nullable().optional(),
    contactEmail: z.string().trim().max(120).nullable().optional(),
    accountNo: z.string().trim().min(1).max(64),
    purpose: z.string().trim().min(1).max(255),
    security: oneOf(SECURITIES, "Choose the security given."),
    securityValue: z.number().nullable().optional(),
    guarantor: z.string().trim().max(191).nullable().optional(),
    principal: z.number().positive().max(MAX_MONEY),
    annualRate: z.number().min(0).max(100),
    rateType: oneOf(RATE_TYPES, "Choose the rate type."),
    repaymentMethod: oneOf(REPAYMENT_METHODS, "Choose the repayment method."),
    paymentFrequency: oneOf(PAYMENT_FREQUENCIES, "Choose the payment frequency."),
    termPayments: z.number().int().min(1).max(600),
    releaseDate: dateOnly,
    firstPaymentDate: dateOnly,
    firstPeriodBasis: oneOf(FIRST_PERIOD_BASES, "Choose how the first period is counted."),
    businessDayRule: oneOf(BUSINESS_DAY_RULES, "Choose the holiday rule."),
    proceedsAccountId: z.number().int().positive(),
    processingFee: z.number().min(0).default(0),
    dstTreatment: oneOf(DST_TREATMENTS, "Choose how the stamp tax is handled."),
    otherCosts: z.number().min(0).default(0),
    penaltyRateMonthly: z.number().min(0).max(100).default(0),
    graceDays: z.number().int().min(0).max(365).default(0),
    pas23Applies: z.boolean().default(false),
    pas23BorrowingType: z.enum(PAS23_TYPES).nullable().optional(),
    pas23Asset: z.string().trim().max(191).nullable().optional(),
    pas23CapitalizeFrom: dateOnly.nullable().optional(),
    pas23CapitalizeUntil: dateOnly.nullable().optional(),
    remarks: z.string().trim().max(2000).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.firstPaymentDate < value.releaseDate) {
      ctx.addIssue({ code: "custom", path: ["firstPaymentDate"], message: "The first payment cannot fall before the release date." });
    }
    if (value.repaymentMethod === "ANNUITY_DUE" && value.firstPaymentDate !== value.releaseDate) {
      ctx.addIssue({
        code: "custom",
        path: ["firstPaymentDate"],
        message: "An annuity due pays its first installment on the release date.",
      });
    }
    if (value.pas23Applies && !value.pas23BorrowingType) {
      ctx.addIssue({ code: "custom", path: ["pas23BorrowingType"], message: "Choose specific or general borrowing." });
    }
    // The API is the gate for this one: a future release date used to be accepted here and only
    // questioned by the form, so the register stored a loan that had not been signed yet.
    if (value.releaseDate > phtToday()) {
      ctx.addIssue({
        code: "custom",
        path: ["releaseDate"],
        message: "A loan cannot be released in the future. Enter the planned date once it is signed.",
      });
    }
  });

export type LoanBody = z.infer<typeof loanBodySchema>;

export const loanFilterSchema = z.object({
  q: z.preprocess((value) => (typeof value === "string" && value.trim() ? value.trim() : undefined), z.string().max(120).optional()),
  status: z.preprocess(
    (value) => (typeof value === "string" && value.trim() && value !== "ALL" ? value.trim() : undefined),
    oneOf(
      ["PENDING_APPROVAL", "REJECTED", "CURRENT", "OVERDUE", "PAID_OFF", "PREPAID"],
      "Choose a status.",
    ).optional(),
  ),
  lenderType: z.preprocess(
    (value) => (typeof value === "string" && value.trim() && value !== "ALL" ? value.trim() : undefined),
    oneOf(LENDER_TYPES, "Choose a lender type.").optional(),
  ),
  page: z.preprocess((value) => Number(value ?? 1), z.number().int().min(1).default(1)),
  pageSize: z.preprocess((value) => Number(value ?? 10), z.number().int().min(1).max(100).default(10)),
});

export type LoanFilter = z.infer<typeof loanFilterSchema>;

/** Zod issues as the route contract's `fieldErrors`: `{ fieldName: ["message"] }`. */
export function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "form";
    if (!result[key]) result[key] = [];
    result[key].push(issue.message);
  }
  return result;
}

