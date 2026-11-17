import { z } from "zod";

const money = z
  .number({ message: "Enter an amount." })
  .finite()
  .positive("The amount has to be more than zero.")
  .max(9_999_999_999, "That amount is out of range.");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

const checkRules = (
  value: { method: string; checkNo?: string | null; checkDate?: string | null },
  ctx: z.RefinementCtx,
) => {
  if (value.method !== "CHECK") return;
  if (!value.checkNo) {
    ctx.addIssue({ code: "custom", path: ["checkNo"], message: "Enter the check number." });
  }
  if (!value.checkDate || !/^\d{4}-\d{2}-\d{2}$/.test(value.checkDate)) {
    ctx.addIssue({ code: "custom", path: ["checkDate"], message: "Pick the check date." });
  }
};

const paymentShape = z.object({
  loanId: z.number().int().positive("Choose a loan first."),
  paymentDate: isoDate,
  amount: money,
  accountId: z.number().int().positive("Choose the account the money came from."),
  method: z.enum(["CASH", "CHECK", "TRANSFER", "EWALLET"]),
  kind: z.enum(["NORMAL", "CATCH_UP"]),
  checkNo: z.string().trim().max(64).optional(),
  checkDate: z.string().optional(),
  lenderReceipt: z.string().trim().max(64).optional(),
  remarks: z.string().trim().max(1000).optional(),
});

export const paymentFormSchema = paymentShape.superRefine(checkRules);

export type PaymentForm = z.input<typeof paymentFormSchema>;

/**
 * The route trusts nothing: the body is revalidated here, not only in the dialog.
 * `kind` defaults to NORMAL and the check fields accept null, because that is what the
 * dialog sends when the method is not CHECK — JSON has no place for `undefined`.
 */
export const paymentBodySchema = paymentShape
  .extend({
    kind: z.enum(["NORMAL", "CATCH_UP"]).default("NORMAL"),
    checkNo: z.string().trim().max(64).nullish(),
    checkDate: z.string().trim().nullish(),
    lenderReceipt: z.string().trim().max(64).nullish(),
    remarks: z.string().trim().max(1000).nullish(),
  })
  .superRefine(checkRules);

export const paymentFilterSchema = z.object({
  q: z.string().trim().optional(),
  loanId: z.coerce.number().int().positive().optional(),
  method: z.enum(["CASH", "CHECK", "TRANSFER", "EWALLET"]).optional(),
  status: z.enum(["POSTED", "REVERSED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

export function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    result[key] = [...(result[key] ?? []), issue.message];
  }
  return result;
}
