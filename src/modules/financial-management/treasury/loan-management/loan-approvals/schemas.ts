import { z } from "zod";

/** Query the queue accepts. Anything else is ignored rather than rejected. */
export const queueQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(["ALL", "PENDING_APPROVAL", "PENDING_RELEASE"]).optional(),
  lenderType: z
    .enum(["ALL", "BANK", "FINANCING", "GOVERNMENT", "RELATED_PARTY", "OTHER"])
    .optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

export const detailQuerySchema = z.object({
  channel: z.enum(["CASH", "CHECK", "TRANSFER"]).optional(),
  accountId: z.coerce.number().int().positive().optional(),
});

export const approveBodySchema = z.object({
  remarks: z.string().trim().max(500).optional().default(""),
});

export const rejectBodySchema = z.object({
  reason: z
    .string({ error: "Say why the loan is being rejected." })
    .trim()
    .min(3, "Say why the loan is being rejected.")
    .max(500, "Keep the reason under 500 characters."),
});

export const releaseBodySchema = z.object({
  releaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date the money arrived."),
  channel: z.enum(["CASH", "CHECK", "TRANSFER"], { error: "Choose how the money arrived." }),
  accountId: z.coerce.number().int().positive().nullable().optional(),
});
