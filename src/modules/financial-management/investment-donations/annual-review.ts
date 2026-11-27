export const reviewItems = [
  "Capital raised and reconciliations",
  "Performance, fees and drift",
  "Gifting candidates",
  "Giving target and documents",
  "Policy and targets",
] as const;

export type ReviewEvent = {
  fiscal_start: string;
  revision: number;
  actor: number;
  prepared_by: number;
  action: "draft" | "sign" | "reopen";
  checks: boolean[];
  reason: string | null;
  occurred_at: string;
  evidenceFingerprint?: string;
  stale?: boolean;
};

/** Select the saved revision independently for each financial year. */
export function latestReviewEvents(events: readonly ReviewEvent[]): ReviewEvent[] {
  const latest = new Map<string, ReviewEvent>();
  for (const event of events) {
    const current = latest.get(event.fiscal_start);
    if (!current || event.revision >= current.revision) latest.set(event.fiscal_start, event);
  }
  return [...latest.values()].sort((a, b) => a.fiscal_start.localeCompare(b.fiscal_start));
}
