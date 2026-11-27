import "server-only";
import { z } from "zod";
import { ledgerDatabase } from "./database";
import { ledgerClient, ledgerRows } from "./directus-ledger.mjs";
import { latestPostingSnapshot } from "./read-postings.mjs";
import { latestReviewEvents, reviewItems, type ReviewEvent } from "../annual-review";
import { annualEvidenceFingerprint } from "./annual-evidence.mjs";
import { createLedgerState } from "./state-engine.mjs";

const review = z.object({
  fiscal_start: z.string(), revision: z.coerce.number().int().positive(), actor: z.coerce.number(),
  prepared_by: z.coerce.number(), action: z.enum(["draft", "sign", "reopen"]),
  checks: z.array(z.boolean()).length(reviewItems.length), reason: z.string().nullable(), occurred_at: z.string(),
  evidenceFingerprint: z.string().optional(), stale: z.boolean().optional(),
});

async function readAnnualReviewEvents(): Promise<ReviewEvent[] | null> {
  try {
    let events: Array<Record<string, unknown>>;
    let fingerprint: string | undefined;
    if (process.env.CGL_MYSQL_URL) {
      events = await ledgerDatabase()("cgl_annual_review_events").orderBy("revision").select("*");
    } else {
      const request = ledgerClient();
      let snapshot: Awaited<ReturnType<typeof latestPostingSnapshot>> = null;
      try {
        snapshot = await latestPostingSnapshot(request);
      } catch (error) {
        // Older Directus deployments may not expose cgl_postings yet.
        if (!/HTTP (403|404)/.test(error instanceof Error ? error.message : "")) throw error;
      }
      const snapshotEvents = snapshot?.annualReviewEvents ??
        (snapshot?.events && typeof snapshot.events === "object" && !Array.isArray(snapshot.events) ?
          (snapshot.events as { annualReviewEvents?: unknown }).annualReviewEvents : undefined);
      if (snapshot) fingerprint = annualEvidenceFingerprint(createLedgerState(snapshot));
      // cgl_postings is the authoritative source for the Directus posting path.
      // Fall back to the normalized event collection during migration/legacy reads.
      events = Array.isArray(snapshotEvents) ? snapshotEvents as Array<Record<string, unknown>> :
        await ledgerRows(request, "cgl_annual_review_events", "fiscal_start,revision,id");
    }
    const parsed = events.map(event => review.parse({ ...event, checks: typeof event.checks === "string" ? JSON.parse(event.checks) : event.checks,
      ...(fingerprint ? { stale: event.evidenceFingerprint !== fingerprint } : {}) }));
    return parsed;
  } catch {
    return null;
  }
}

export async function readAnnualReviews(): Promise<ReviewEvent[] | null> {
  const events = await readAnnualReviewEvents();
  return events ? latestReviewEvents(events) : null;
}

export async function readAnnualReviewHistory(): Promise<ReviewEvent[] | null> {
  const events = await readAnnualReviewEvents();
  return events?.sort((a, b) => a.fiscal_start.localeCompare(b.fiscal_start) || a.revision - b.revision) ?? null;
}
