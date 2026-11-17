import { z } from "zod";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const accountBodySchema = z.object({
  name: z.string().trim().min(2, "Give the account a name.").max(120),
  kind: z.enum(["BANK", "CASH", "EWALLET"]),
  coaId: z.coerce.number().int().positive("Choose the GL account this payment account posts to."),
  chargePct: z.coerce.number().min(0, "A charge cannot be negative.").max(100, "A charge above 100% is not a rate."),
  sort: z.coerce.number().int().min(0).max(999).optional(),
});

export const accountPatchSchema = accountBodySchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const holidayBodySchema = z.object({
  name: z.string().trim().min(2, "Name the holiday.").max(120),
  holidayDate: z.string().regex(DATE, "Pick the holiday date."),
  kind: z.enum(["REGULAR", "SPECIAL", "LOCAL"]),
});

export const holidayPatchSchema = holidayBodySchema.partial();

export const mappingBodySchema = z.object({
  coaId: z.union([z.coerce.number().int().positive(), z.null()]),
});

export const lockBodySchema = z.object({
  lockedThrough: z.string().regex(DATE, "Pick the date the books are closed through."),
  note: z.string().trim().max(255).optional(),
});

export const reopenBodySchema = z.object({
  reason: z.string().trim().min(3, "Say why the period is being reopened.").max(255),
});

export type AccountBody = z.infer<typeof accountBodySchema>;
export type AccountPatch = z.infer<typeof accountPatchSchema>;
export type HolidayBody = z.infer<typeof holidayBodySchema>;
export type HolidayPatch = z.infer<typeof holidayPatchSchema>;
export type LockBody = z.infer<typeof lockBodySchema>;
