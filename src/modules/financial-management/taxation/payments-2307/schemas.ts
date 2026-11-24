import { periodsForForm } from "./constants";
import { z } from "zod";

import { PAYMENT_FORMS, PAYMENT_PERIOD_KEYS, PERIOD_KEYS, isStatutoryRate } from "./constants";
import type {
  CertificateDirection,
  PaymentPeriodKey,
  PeriodKey,
  WithholdingIncomeType,
} from "./types";

/**
 * The enum lists live in constants.ts; casting to a non-empty tuple is the only way
 * for zod to keep the literal union while sharing that one source.
 */
export const periodKeySchema = z.enum(PERIOD_KEYS as [PeriodKey, ...PeriodKey[]]);
const DIRECTION_ENUM = z.enum(["RECEIVED", "ISSUED"] as [CertificateDirection, ...CertificateDirection[]]);
const INCOME_TYPE_ENUM = z.enum([
  "RENT",
  "FEE",
  "SERVICES",
  "CONSTRUCTION",
  "GOODS",
  "OTHER",
] as [WithholdingIncomeType, ...WithholdingIncomeType[]]);
/** Payments settle any filing the calendar lists, so they get their own wider vocabularies. */
export const paymentPeriodKeySchema = z.enum(
  PAYMENT_PERIOD_KEYS as [PaymentPeriodKey, ...PaymentPeriodKey[]],
);
const PAYMENT_FORM_ENUM = z.enum(
  PAYMENT_FORMS as unknown as [(typeof PAYMENT_FORMS)[number], ...(typeof PAYMENT_FORMS)[number][]],
);

export const MAX_AMOUNT = 999_999_999_999;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const money = z.number().min(0).max(MAX_AMOUNT);
const scopeShape = {
  companyId: z.number().int().positive(),
  year: z.number().int().min(2000).max(2100),
};

/** Bodies arrive as JSON numbers; forms arrive as strings and convert at the edge. */
export const certificateBodySchema = z.object({
  ...scopeShape,
  periodKey: periodKeySchema,
  direction: DIRECTION_ENUM,
  counterpartyCompanyId: z.number().int().positive().nullable().optional(),
  counterpartyName: z.string().trim().min(1, "Name the counterparty").max(180),
  counterpartyTin: z.string().trim().max(30).nullable().optional(),
  incomeType: INCOME_TYPE_ENUM,
  incomeAmount: money,
  // Only ATC rates exist on a 2307. A stored 1.01% means the withheld amount was computed on a
  // VAT-inclusive base, so the record is refused until the base is put right.
  taxRate: z
    .number()
    .min(0)
    .max(100)
    .refine(isStatutoryRate, "Use a withholding rate: 1%, 2%, 5%, 10% or 15% of the VAT-exclusive income"),
  taxWithheld: money,
  dateReceived: z.string().regex(DATE_PATTERN).nullable().optional(),
  remarks: z.string().trim().max(300).nullable().optional(),
});

export const paymentBodySchema = z
  .object({
    ...scopeShape,
    periodKey: paymentPeriodKeySchema,
    formCode: PAYMENT_FORM_ENUM,
    paidOn: z.string().regex(DATE_PATTERN),
    amount: money,
    referenceNo: z.string().trim().max(80).nullable().optional(),
    remarks: z.string().trim().max(300).nullable().optional(),
  })
  .superRefine((values, ctx) => {
    // A stored payment must sit under a pair the form is actually filed for. This lived only in
    // the browser schema once, which let a direct POST store 0619-E/M03, 1702Q/Q4, 1702/Q1 and
    // 2307/ANNUAL — money filed against a period the form is never filed for.
    if (!periodsForForm(values.formCode).includes(values.periodKey)) {
      ctx.addIssue({
        code: "custom",
        path: ["periodKey"],
        message: `${values.formCode} is not filed for ${values.periodKey}`,
      });
    }
  });

export const prefillBodySchema = z.object({ ...scopeShape });

export const lockBodySchema = z.object({
  ...scopeShape,
  periodKey: periodKeySchema,
  reason: z.string().trim().min(3, "Say why the period is being locked").max(300),
});

export const unlockBodySchema = z.object({
  ...scopeShape,
  reason: z.string().trim().min(3, "Say why the period is being unlocked").max(300),
});

export type CertificateBody = z.infer<typeof certificateBodySchema>;
export type PaymentBody = z.infer<typeof paymentBodySchema>;
export type LockBody = z.infer<typeof lockBodySchema>;
export type UnlockBody = z.infer<typeof unlockBodySchema>;

const amountText = z
  .string()
  .trim()
  .min(1, "Enter an amount")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0, "Enter a number")
  .refine((value) => Number(value) <= MAX_AMOUNT, "That amount is too large");

const rateText = z
  .string()
  .trim()
  .min(1, "Enter a rate")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100, "Rate must be 0–100");

export const certificateFormSchema = z
  .object({
    periodKey: periodKeySchema,
    direction: DIRECTION_ENUM,
    incomeType: INCOME_TYPE_ENUM,
    counterpartyName: z.string().trim().min(2, "Name the counterparty").max(180),
    // A 2307 without a TIN cannot be matched to the payor's books, so it is not a certificate yet.
    counterpartyTin: z
      .string()
      .trim()
      .max(30)
      .refine(
        (value) => value.replace(/\D/g, "").length >= 9,
        "Enter the counterparty's TIN as issued by BIR (9 to 14 digits)",
      ),
    incomeAmount: amountText,
    taxRate: rateText.refine(
      (value) => isStatutoryRate(Number(value)),
      "Use a withholding rate: 1%, 2%, 5%, 10% or 15% of the VAT-exclusive income",
    ),
    taxWithheld: amountText,
    // The date received/issued is what turns a claim into a substantiated certificate.
    dateReceived: z.string().trim(),
    remarks: z.string().trim().max(300),
  })
  .superRefine((values, ctx) => {
    if (!values.dateReceived) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateReceived"],
        message:
          values.direction === "ISSUED"
            ? "Pick the date the certificate was issued"
            : "Pick the date the certificate was received",
      });
    } else if (!isRealDate(values.dateReceived)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateReceived"],
        message: "Use a real date",
      });
    }
    if (Number(values.taxWithheld) > Number(values.incomeAmount)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["taxWithheld"],
        message: "Withheld cannot exceed the income amount",
      });
    }
  });

export type CertificateFormValues = z.infer<typeof certificateFormSchema>;

export const paymentFormSchema = z.object({
  periodKey: paymentPeriodKeySchema,
  formCode: PAYMENT_FORM_ENUM,
  paidOn: z.string().trim().refine(isRealDate, "Pick the date the payment was made"),
  // Zero is allowed: a nil return is filed with the BIR like any other, and the reference number
  // is what proves it was. Every other amount is money that moved, so it must be above zero.
  amount: amountText,
  referenceNo: z.string().trim().max(80),
  remarks: z.string().trim().max(300),
}).superRefine((values, ctx) => {
  const amount = Number(values.amount);
  if (amount === 0 && values.referenceNo.trim() === "") {
    ctx.addIssue({
      code: "custom",
      path: ["referenceNo"],
      message: "A nil return needs the BIR filing reference number",
    });
  }
  // A stored payment must sit under a pair the form is actually filed for. Repointing it silently
  // would record money against a period nobody chose, so this rejects instead.
  if (!periodsForForm(values.formCode).includes(values.periodKey)) {
    ctx.addIssue({
      code: "custom",
      path: ["periodKey"],
      message: `${values.formCode} is not filed for ${values.periodKey}`,
    });
  }
});

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export const lockFormSchema = z.object({
  reason: z.string().trim().min(3, "Say why the period is being locked").max(300),
});

export type LockFormValues = z.infer<typeof lockFormSchema>;

export const unlockFormSchema = z.object({
  reason: z.string().trim().min(3, "Say why the period is being unlocked").max(300),
});

export type UnlockFormValues = z.infer<typeof unlockFormSchema>;

export function toAmount(raw: string): number {
  return Number(raw.trim());
}

export function blankToNull(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

export function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const flattened = error.flatten();
  const first: Record<string, string> = {};
  for (const [field, messages] of Object.entries(flattened.fieldErrors)) {
    const text = Array.isArray(messages) ? messages[0] : undefined;
    if (text) first[field] = text;
  }
  return first;
}

