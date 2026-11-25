import "server-only";
import { z } from "zod";
import { ledgerDatabase } from "./database";
import { ledgerClient, ledgerRows } from "./directus-ledger.mjs";

const payload = z.object({
  cash: z.record(z.string(), z.number().nullable()),
  units: z.record(z.string(), z.number().nullable()),
  notes: z.record(z.string(), z.string()),
  snap: z.record(z.string(), z.number()),
});
const row = z.object({
  month_start: z.string(), revision: z.coerce.number().int().positive(),
  prepared_by: z.coerce.number(), approved_by: z.coerce.number().nullable(),
  signed_at: z.string().nullable(), payload,
});
export type ReconciliationRecord = z.infer<typeof row>;

export async function readReconciliations(): Promise<ReconciliationRecord[] | null> {
  try {
    const data = process.env.CGL_MYSQL_URL ? await ledgerDatabase()("cgl_reconciliations").select("*") :
      await ledgerRows(ledgerClient(), "cgl_reconciliations", "month_start");
    return z.array(row).parse(data.map((item: { payload: unknown }) => ({
      ...item, payload: typeof item.payload === "string" ? JSON.parse(item.payload) : item.payload,
    })));
  } catch {
    return null;
  }
}
