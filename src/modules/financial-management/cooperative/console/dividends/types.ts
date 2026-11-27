import { z } from "zod";

function fixedDecimal(value: string, scale: number) {
  const [integer, fraction = ""] = value.split(".");
  return `${BigInt(integer)}.${fraction.padEnd(scale, "0")}`;
}

function percent(maximum: number) {
  return z.string().trim()
    .regex(/^\d{1,3}(?:\.\d{1,4})?$/, "Enter a percentage with up to four decimal places.")
    .refine(value => Number(value) <= maximum, `Enter a percentage from 0 to ${maximum}.`)
    .transform(value => fixedDecimal(value, 4));
}

export const dividendInputs = z.object({
  netSurplus: z.string().trim()
    .regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Enter a nonnegative surplus with up to ten whole digits and two decimal places.")
    .transform(value => fixedDecimal(value, 2)),
  reservePercent: percent(50),
  educationPercent: percent(50),
  savingsSharePercent: percent(100),
});

export type DividendInputs = z.output<typeof dividendInputs>;

const id = z.number().int().positive();
export const dividendDraftSchema = z.object({
  id, year: id, revision: id, values: dividendInputs, savedBy: z.string(), savedAt: z.string(),
});
export type DividendDraft = z.output<typeof dividendDraftSchema>;

const signed = z.string().regex(/^-?\d+\.\d{2}$/);
export const dividendBasisSchema = z.object({
  from: z.iso.date(), through: z.iso.date(), days: id.max(366), provisional: z.boolean(),
  rows: z.object({
    membershipId: id, employeeId: id, name: z.string(), department: z.string().nullable(),
    averageSavings: signed, savingsCentavoDays: z.string().regex(/^-?\d+$/), netCashLoanInterest: signed,
    patronageEligible: z.boolean(),
  }).array(),
});
export type DividendBasis = z.output<typeof dividendBasisSchema>;

const money = z.string().regex(/^\d{1,10}\.\d{2}$/);
const pool = z.object({ available: money, allocated: money, retained: money });
const account = z.object({ id, code: z.string(), name: z.string() });
export const dividendJournalSchema = z.object({
  kind: z.enum(["STATUTORY", "DECLARATION", "MEMBER_CREDIT"]),
  membershipId: id.nullable(),
  pairs: z.object({ debit: account, credit: account, amount: money }).array().min(1),
});

export const dividendPostingPreviewSchema = z.object({
  draft: dividendDraftSchema, postingDate: z.iso.date(), basis: dividendBasisSchema,
  allocation: z.object({
    netSurplus: money, reserve: money, education: money, distributable: money, undividedSurplus: money,
    savings: pool, patronage: pool, effectiveSavingsRate: z.string().nullable(),
    credits: z.object({ membershipId: id, savingsCredit: money, patronageRefund: money, total: money }).array(),
  }),
  recipients: z.object({ membershipId: id, before: money, after: money }).array(),
  journalPreview: dividendJournalSchema.array(),
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});
export type DividendPostingPreview = z.output<typeof dividendPostingPreviewSchema>;

export const dividendPostedRunSchema = dividendPostingPreviewSchema.extend({
  reference: z.string(), postedAt: z.string(), postedBy: z.string(), postedById: id,
  journals: dividendJournalSchema.pick({ kind: true, membershipId: true }).extend({ id, number: z.string() }).array().min(1),
});
export type DividendPostedRun = z.output<typeof dividendPostedRunSchema>;

export const dividendActionDetails = z.object({
  preview: dividendPostingPreviewSchema.optional(), run: dividendPostedRunSchema.optional(),
});

export type DividendYear = { draft: DividendDraft | null; posted: DividendPostedRun | null; postingAvailable: boolean };

export const dividendJournalLabels = { STATUTORY: "Statutory allocations", DECLARATION: "Dividend declaration", MEMBER_CREDIT: "Savings credit" };
