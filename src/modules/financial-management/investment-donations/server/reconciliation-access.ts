import "server-only";
import { z } from "zod";
import { ledgerDatabase } from "./database";

const payload = z.object({
  cash: z.record(z.string(), z.number().nullable()),
  units: z.record(z.string(), z.number().nullable()),
  notes: z.record(z.string(), z.string()),
  snap: z.record(z.string(), z.number()),
});
const row = z.object({
  month_start: z.string(), revision: z.number().int().positive(),
  prepared_by: z.coerce.number(), approved_by: z.coerce.number().nullable(),
  signed_at: z.string().nullable(), payload,
});
export type ReconciliationRecord = z.infer<typeof row>;

export async function readReconciliations(): Promise<ReconciliationRecord[] | null> {
  try {
    const data = await ledgerDatabase()("cgl_reconciliations").select("*");
    return z.array(row).parse(data.map((item: { payload: unknown }) => ({
      ...item, payload: typeof item.payload === "string" ? JSON.parse(item.payload) : item.payload,
    })));
  } catch {
    return null;
  }
}
