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

function money(message: string, { min = 0, max = MAX_MONEY } = {}) {
  return z
    .number({ message })
    .refine((value) => Number.isFinite(value), message)
    .refine((value) => value >= min && value <= max, message);
}

const dateOnly = z.string().regex(DATE_PATTERN, "Choose a date.");

/**
 * The loan as the register form holds it: strings for inputs, numbers for money.
 *
 * `account_no` is `varchar(64)` and `purpose` is `varchar(255)` in the database, so the length
 * ceilings here are the column widths, not arbitrary limits — a longer value comes back from
 * Directus as a wrapped 500 rather than a field error.
 */
export const loanFormSchema = z
  .object({
    lenderName: z.string().trim().min(1, "Enter the lender.").max(191, "The lender name is too long."),
    lenderType: oneOf(LENDER_TYPES, "Choose the lender type."),
    branch: z.string().trim().max(120, "The branch is too long.").optional().or(z.literal("")),
    accountOfficer: z.string().trim().max(120, "The account officer is too long.").optional().or(z.literal("")),
    contactPhone: z.string().trim().max(40, "The phone number is too long.").optional().or(z.literal("")),
    contactEmail: z
      .string()
      .trim()
      .max(120, "The email is too long.")
      .refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Enter a valid email address.")
      .optional()
      .or(z.literal("")),
    accountNo: z.string().trim().min(1, "Enter the lender's account number.").max(64, "The account number is too long."),
    purpose: z.string().trim().min(1, "Enter the purpose of the loan.").max(255, "The purpose is too long."),
    security: oneOf(SECURITIES, "Choose the security given."),
    securityValue: money("Enter the security value.", { min: 0 }).nullable().optional(),
    guarantor: z.string().trim().max(191, "The guarantor is too long.").optional().or(z.literal("")),
    principal: money("Enter the principal amount.", { min: 1 }),
    annualRate: z
      .number({ message: "Enter the interest rate." })
      .refine((value) => value >= 0 && value <= 100, "The rate must be between 0 and 100."),
    rateType: oneOf(RATE_TYPES, "Choose the rate type."),
    repaymentMethod: oneOf(REPAYMENT_METHODS, "Choose the repayment method."),
    paymentFrequency: oneOf(PAYMENT_FREQUENCIES, "Choose the payment frequency."),
    termPayments: z
      .number({ message: "Enter the number of installments." })
      .int("Use a whole number of installments.")
      .min(1, "A loan needs at least one installment.")
      .max(600, "That is more installments than this register accepts."),
    releaseDate: dateOnly,
    firstPaymentDate: dateOnly,
    firstPeriodBasis: oneOf(FIRST_PERIOD_BASES, "Choose how the first period is counted."),
    businessDayRule: oneOf(BUSINESS_DAY_RULES, "Choose what happens when a due date falls on a holiday."),
    proceedsAccountId: z
      .number({ message: "Choose the account that received the money." })
      .int()
      .min(1, "Choose the account that received the money."),
    processingFee: money("Enter the processing fee."),
    dstTreatment: oneOf(DST_TREATMENTS, "Choose how the stamp tax is handled."),
    otherCosts: money("Enter the other costs."),
    penaltyRateMonthly: z
      .number({ message: "Enter the penalty rate." })
      .refine((value) => value >= 0 && value <= 100, "The penalty rate must be between 0 and 100."),
    graceDays: z
      .number({ message: "Enter the grace period." })
      .int("Use whole days.")
      .min(0, "The grace period cannot be negative.")
      .max(365, "That grace period is longer than a year."),
    pas23Applies: z.boolean(),
    pas23BorrowingType: z.enum(PAS23_TYPES).nullable().optional(),
    pas23Asset: z.string().trim().max(191, "The qualifying asset name is too long.").optional().or(z.literal("")),
    pas23CapitalizeFrom: z.string().regex(DATE_PATTERN, "Choose a date.").optional().or(z.literal("")),
    pas23CapitalizeUntil: z.string().regex(DATE_PATTERN, "Choose a date.").optional().or(z.literal("")),
    remarks: z.string().trim().max(2000, "Keep the remarks under 2000 characters.").optional().or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    if (value.firstPaymentDate < value.releaseDate) {
      ctx.addIssue({
        code: "custom",
        path: ["firstPaymentDate"],
        message: "The first payment cannot fall before the release date.",
      });
    }
    if (value.repaymentMethod === "ANNUITY_DUE" && value.firstPaymentDate !== value.releaseDate) {
      ctx.addIssue({
        code: "custom",
        path: ["firstPaymentDate"],
        message: "An annuity due pays its first installment on the release date, so the two dates must match.",
      });
    }
    if (value.pas23Applies && !value.pas23BorrowingType) {
      ctx.addIssue({
        code: "custom",
        path: ["pas23BorrowingType"],
        message: "Choose whether this is a specific or a general borrowing.",
      });
    }
    if (
      value.pas23Applies &&
      value.pas23CapitalizeFrom &&
      value.pas23CapitalizeUntil &&
      value.pas23CapitalizeUntil < value.pas23CapitalizeFrom
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["pas23CapitalizeUntil"],
        message: "Capitalization cannot end before it starts.",
      });
    }
    if (value.releaseDate > phtToday()) {
      ctx.addIssue({
        code: "custom",
        path: ["releaseDate"],
        message: "A loan cannot be released in the future. Enter the planned date once it is signed.",
      });
    }
  });

export type LoanFormValues = z.infer<typeof loanFormSchema>;

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
  });

export type LoanBody = z.infer<typeof loanBodySchema>;

export const loanFilterSchema = z.object({
  q: z.preprocess((value) => (typeof value === "string" && value.trim() ? value.trim() : undefined), z.string().max(120).optional()),
  status: z.preprocess(
    (value) => (typeof value === "string" && value.trim() && value !== "ALL" ? value.trim() : undefined),
    oneOf(
      ["PENDING_APPROVAL", "REJECTED", "PENDING_RELEASE", "CURRENT", "OVERDUE", "PAID_OFF", "PREPAID"],
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

