import "server-only";
import { z } from "zod";
import { ledgerDatabase } from "./database";
import { reviewItems, type ReviewEvent } from "../annual-review";

const review = z.object({
  fiscal_start: z.string(), revision: z.coerce.number().int().positive(), actor: z.coerce.number(),
  prepared_by: z.coerce.number(), action: z.enum(["draft", "sign", "reopen"]),
  checks: z.array(z.boolean()).length(reviewItems.length), reason: z.string().nullable(), occurred_at: z.string(),
});

export async function readAnnualReviews(): Promise<ReviewEvent[] | null> {
  try {
    const events = await ledgerDatabase()("cgl_annual_review_events").orderBy("revision").select("*");
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
