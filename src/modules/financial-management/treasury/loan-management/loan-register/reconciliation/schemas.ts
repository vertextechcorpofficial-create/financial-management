import { z } from "zod";

/** `YYYY-MM-DD` in the PHT wall clock, which is what every `date` column here stores. */
const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date on the calendar.");

const money = z.coerce
  .number({ error: "Enter an amount." })
  .refine((value) => Number.isFinite(value), "Enter an amount.")
  .refine((value) => Math.abs(value) < 1_000_000_000_000, "That amount is too large.");

export const rollForwardQuerySchema = z
  .object({
    periodStart: dateOnly,
    periodEnd: dateOnly,
  })
  .refine((value) => value.periodStart <= value.periodEnd, {
    message: "The period ends before it starts.",
    path: ["periodEnd"],
  });

export const saveReconciliationSchema = z
  .object({
    periodStart: dateOnly,
    periodEnd: dateOnly,
    remarks: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .refine((value) => value.periodStart <= value.periodEnd, {
    message: "The period ends before it starts.",
    path: ["periodEnd"],
  });

export const reconciliationFilterSchema = z.object({
  result: z.enum(["ALL", "RECONCILED", "DIFFERENCE"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(0).max(500).optional(),
});

export const statementBodySchema = z.object({
  loanId: z.coerce.number().int().positive("Choose a loan."),
  statementDate: dateOnly,
  lenderPrincipal: money,
  lenderInterest: money,
  lenderPenalties: money,
  lenderAdvances: money,
  remarks: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const statementFilterSchema = z.object({
  result: z.enum(["ALL", "AGREES", "DIFFERS"]).optional(),
  loanId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(0).max(500).optional(),
});

/** Turns a Zod failure into the `{field: [message]}` shape the route contract returns. */
export function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "form";
    out[key] = [...(out[key] ?? []), issue.message];
  }
  return out;
}
