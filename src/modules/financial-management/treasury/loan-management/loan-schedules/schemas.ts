import { z } from "zod";

/** `YYYY-MM-DD`, the shape every date column on the desk stores. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in the form YYYY-MM-DD.");

const positiveInt = z.coerce.number().int().positive();

/**
 * Filters for the schedule screen. Everything but `asOf` is optional so the page can open on
 * the portfolio view before a loan is picked.
 */
export const scheduleQuerySchema = z.object({
  loanId: positiveInt.optional(),
  version: positiveInt.optional(),
  asOf: isoDate.optional(),
  status: z.string().trim().min(1).max(32).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(0).max(500).default(25),
});

/** Body of the status refresh. `dryRun` lets the desk see the plan without writing it. */
export const refreshBodySchema = z.object({
  asOf: isoDate.optional(),
  loanId: positiveInt.optional(),
  dryRun: z.boolean().optional(),
});
