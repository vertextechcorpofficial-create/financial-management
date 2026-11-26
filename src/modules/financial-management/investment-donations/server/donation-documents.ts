import "server-only";
import { z } from "zod";
import { ledgerDatabase } from "./database";
import { ledgerClient, ledgerRows } from "./directus-ledger.mjs";
import { latestPostingSnapshot } from "./read-postings.mjs";

const document = z.object({ form: z.string().min(1).max(200).default("BIR filing"), journalNo: z.number().int().positive().optional(), reference: z.string(),
  status: z.enum(["reference-only", "filed-manually"]).optional(), filedOn: z.string().nullable().optional(),
  receiptReference: z.string().nullable().optional(), evidenceReference: z.string().nullable().optional(),
  evidenceFileId: z.string().uuid().nullable().optional(),
  evidenceFile: z.object({ id: z.string().uuid(), filename: z.string(), type: z.string(), size: z.number().positive() }).nullable().optional(),
  documents: z.object({ cert: z.boolean().optional(), f1800: z.boolean().optional(), deed: z.boolean().optional() }).optional() });
export type DonationDocument = z.infer<typeof document>;

export async function readDonationDocuments(cgt: boolean | "all" = false): Promise<Record<string, DonationDocument> | null> {
  try {
    const actions = cgt === "all" ? ["cgt_filing", "gift_document"] : [cgt ? "cgt_filing" : "gift_document"];
    const rows = process.env.CGL_MYSQL_URL ? await ledgerDatabase()("cgl_audit_events").whereIn("action", actions).orderBy("id").select("entry_id", "after_state") :
      await ledgerRows(ledgerClient(), "cgl_audit_events", "id", { action: { _in: actions } });
    if (!process.env.CGL_MYSQL_URL) {
      const remote = ledgerClient();
      const snapshot = await latestPostingSnapshot(remote);
      // Each cgl_postings row is immutable; merge older snapshots too so a
      // later posting cannot hide filing/document events from earlier rows.
      const history = await ledgerRows(remote, "cgl_postings", "state_revision");
      for (const posting of history) {
        const state = typeof posting.snapshot === "string" ? JSON.parse(posting.snapshot) : posting.snapshot;
        rows.push(...(state?.auditEvents ?? []).filter((row: { action?: string }) => actions.includes(row.action ?? ""))
          .map((row: { entry_id?: string; after_state?: unknown }, index: number) => ({ entry_id: row.entry_id, after_state: row.after_state, revision: Number(posting.state_revision) + index / 1000000 })));
      }
      if (snapshot) rows.push(...(snapshot.auditEvents ?? []).filter((row: { action?: string }) => actions.includes(row.action ?? ""))
        .map((row: { entry_id?: string; after_state?: unknown }) => ({ entry_id: row.entry_id, after_state: row.after_state, revision: Number(snapshot.posting.stateRevision) + 1 })));
    }
    return Object.fromEntries(rows.slice().sort((a, b) => Number(a.revision ?? 0) - Number(b.revision ?? 0)).flatMap(row => {
      const parsed = document.parse(typeof row.after_state === "string" ? JSON.parse(row.after_state) : row.after_state);
      if (parsed.status === "filed-manually" && !parsed.evidenceFileId) {
        parsed.status = "reference-only";
      }
      return [[row.entry_id, parsed], ...(parsed.journalNo ? [[`journal:${parsed.journalNo}`, parsed]] : [])];
    }));
  } catch {
    return null;
  }
}
