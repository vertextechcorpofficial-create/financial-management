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
};
