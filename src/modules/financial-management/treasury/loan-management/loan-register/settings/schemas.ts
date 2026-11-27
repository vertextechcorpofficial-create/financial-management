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
  description: z.string().trim().max(255, "Keep the description under 255 characters.").optional(),
});

const MAPPING_KEY = /^[A-Z][A-Z0-9_]{2,63}$/;

/** A line account added from the GL tab: the key, the account, the group it sits under. */
export const mappingCreateBodySchema = z.object({
  mapping_key: z
    .string()
    .trim()
    .regex(MAPPING_KEY, "A key is uppercase letters, digits and underscores, starting with a letter."),
  coa_id: z.coerce.number().int().positive("Choose the posting account."),
  mapping_group: z.string().trim().min(1, "Choose a group.").max(64, "Keep the group under 64 characters."),
  mapping_label: z
    .string()
    .trim()
    .min(1, "Give the line an account label.")
    .max(120, "Keep the label under 120 characters."),
  /** The deck's "Usage Description"; stored in `usage_description`. */
  usage_description: z.string().trim().max(255, "Keep the description under 255 characters.").optional(),
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
export type MappingCreateBody = z.infer<typeof mappingCreateBodySchema>;

/** A new line account as the client holds it; the route takes the snake_case form. */
export interface LineAccountBody {
  mappingKey: string;
  coaId: number;
  mappingGroup: string;
  mappingLabel: string;
  mappingDescription: string;
}
