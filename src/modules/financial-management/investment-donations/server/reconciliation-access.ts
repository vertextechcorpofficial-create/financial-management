import "server-only";
import { z } from "zod";
import { ledgerDatabase } from "./database";
import { ledgerClient, ledgerRows } from "./directus-ledger.mjs";
import { latestPostingSnapshot } from "./read-postings.mjs";

const payload = z.object({
  cash: z.record(z.string(), z.number().nullable()),
  units: z.record(z.string(), z.number().nullable()),
  notes: z.record(z.string(), z.string()),
  snap: z.record(z.string(), z.number()).default({}),
});
const row = z.object({
  month_start: z.string(), revision: z.coerce.number().int().positive(),
  prepared_by: z.coerce.number(), approved_by: z.coerce.number().nullable(),
  signed_at: z.string().nullable(), payload,
});
export type ReconciliationRecord = z.infer<typeof row>;

const historicalRow = z.object({
  month_start: z.string(), at: z.string(), by: z.string(),
  cash: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
  units: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
  notes: z.record(z.string(), z.string()), snap: z.record(z.string(), z.number()),
});

export function parseReconciliations(data: unknown): ReconciliationRecord[] {
  return z.array(z.unknown()).parse(data).flatMap(item => {
    // Legacy signed snapshots are displayed from registers.recons, not as drafts.
    if (item && typeof item === "object" && !("payload" in item) && !("revision" in item)) {
      historicalRow.parse(item);
      return [];
    }
    const record = row.extend({ payload: z.unknown() }).parse(item);
    return [row.parse({ ...record,
      payload: typeof record.payload === "string" ? JSON.parse(record.payload) : record.payload,
    })];
  });
}

export async function readReconciliations(): Promise<ReconciliationRecord[] | null> {
  try {
    let data;
    if (process.env.CGL_MYSQL_URL) {
      data = await ledgerDatabase()("cgl_reconciliations").select("*");
    } else {
      const request = ledgerClient();
      let snapshot = null;
      try { snapshot = await latestPostingSnapshot(request); }
      catch (error) {
        if (!/HTTP (403|404)/.test(error instanceof Error ? error.message : "")) throw error;
      }
      data = snapshot && Array.isArray(snapshot.recons) ? snapshot.recons :
        await ledgerRows(request, "cgl_reconciliations", "month_start");
    }
    return parseReconciliations(data);
  } catch {
    return null;
  }
}
