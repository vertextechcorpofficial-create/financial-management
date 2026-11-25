import "server-only";
import { z } from "zod";
import { ledgerDatabase } from "./database";
import { ledgerClient, ledgerRows } from "./directus-ledger.mjs";
import { reviewItems, type ReviewEvent } from "../annual-review";

const review = z.object({
  fiscal_start: z.string(), revision: z.coerce.number().int().positive(), actor: z.coerce.number(),
  prepared_by: z.coerce.number(), action: z.enum(["draft", "sign", "reopen"]),
  checks: z.array(z.boolean()).length(reviewItems.length), reason: z.string().nullable(), occurred_at: z.string(),
});

export async function readAnnualReviews(): Promise<ReviewEvent[] | null> {
  try {
    const events = process.env.CGL_MYSQL_URL ? await ledgerDatabase()("cgl_annual_review_events").orderBy("revision").select("*") :
      await ledgerRows(ledgerClient(), "cgl_annual_review_events", "fiscal_start,revision,id");
    const latest = new Map<string, ReviewEvent>();
    for (const event of events) {
      const parsed = review.parse({ ...event, checks: typeof event.checks === "string" ? JSON.parse(event.checks) : event.checks });
      latest.set(parsed.fiscal_start, parsed);
    }
    return [...latest.values()];
  } catch {
    return null;
  }
}
