import { z } from "zod";

const blank = (value: unknown) => (value === "" || value === null ? undefined : value);

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-02-15.");

export const changesQuerySchema = z.object({
  q: z.preprocess(blank, z.string().trim().max(120).optional()),
  kind: z.preprocess(blank, z.enum(["PREPAYMENT", "RATE_CHANGE", "RESTRUCTURE", "PAYOFF"]).optional()),
  loanId: z.preprocess(blank, z.coerce.number().int().positive().optional()),
  from: z.preprocess(blank, dateOnly.optional()),
  to: z.preprocess(blank, dateOnly.optional()),
  page: z.preprocess(blank, z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess(blank, z.coerce.number().int().min(1).max(200).default(10)),
});

export type ChangesQuery = z.infer<typeof changesQuerySchema>;

export const recordChangeSchema = z.object({
  loanId: z.coerce.number().int().positive(),
  kind: z.enum(["PREPAYMENT", "RATE_CHANGE", "RESTRUCTURE", "PAYOFF"]),
  effectiveDate: dateOnly,
  amount: z.preprocess(blank, z.coerce.number().min(0).optional()),
  prepaymentOption: z.preprocess(blank, z.enum(["SHORTEN_TERM", "LOWER_INSTALLMENT"]).optional()),
  newRate: z.preprocess(
    blank,
    z.coerce
      .number()
      .gt(0, "The new rate has to be greater than zero.")
      .max(30, "A rate above 30% a year is almost certainly a typo.")
      .optional(),
  ),
  newTermPayments: z.preprocess(blank, z.coerce.number().int().min(1).max(600).optional()),
  penaltyRate: z.preprocess(blank, z.coerce.number().min(0).max(20).optional()),
  accountId: z.preprocess(blank, z.coerce.number().int().positive().optional()),
  notes: z.preprocess(blank, z.string().trim().max(500).optional()),
});

export type RecordChangeBody = z.infer<typeof recordChangeSchema>;

export const reverseChangeSchema = z.object({
  reason: z.preprocess(blank, z.string().trim().max(300).optional()),
});

export type ReverseChangeBody = z.infer<typeof reverseChangeSchema>;
