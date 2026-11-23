import "server-only";
import { z } from "zod";
import { ledgerDatabase } from "./database";

const document = z.object({ form: z.enum(["2322", "1800", "1707", "1707-A"]), reference: z.string() });
export type DonationDocument = z.infer<typeof document>;

export async function readDonationDocuments(cgt = false): Promise<Record<string, DonationDocument> | null> {
  try {
    const rows = await ledgerDatabase()("cgl_audit_events").where({ action: cgt ? "cgt_filing" : "gift_document" })
      .orderBy("id").select("entry_id", "after_state");
    return Object.fromEntries(rows.map(row => [row.entry_id, document.parse(
      typeof row.after_state === "string" ? JSON.parse(row.after_state) : row.after_state,
    )]));
  } catch {
    return null;
  }
}
