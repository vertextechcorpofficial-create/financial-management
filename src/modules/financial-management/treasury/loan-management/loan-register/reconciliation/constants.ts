import type { ReconciliationResult, StatementResult } from "./types";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  // Destructive text on its own tint measures ~3:1, so the pill carries a red ring over the tint
  // and keeps the label at foreground contrast (the pairing Notice uses for a refusal).
  danger: "bg-destructive/10 text-foreground ring-1 ring-inset ring-destructive/40",
  info: "bg-info/15 text-info",
  accent: "bg-primary/10 text-primary",
};

/** One accent per page, borrowed from the treasury family so loan pages read as siblings. */
export const ACCENT = {
  rail: "border-t-primary/40",
  tile: "border-l-primary/60 from-primary/5",
} as const;

export function toneClass(tone: Tone): string {
  return TONE_CLASS[tone];
}

export const RECONCILIATION_PAGE_SIZE = 10;
export const RECONCILIATION_STORAGE_KEY = "fm.loan-reconciliation.rows";
export const STATEMENT_PAGE_SIZE = 10;
export const STATEMENT_STORAGE_KEY = "fm.loan-statements.rows";

/** The GL accounts the ledger side of the roll-forward is built from. Read from
 *  `loan_gl_mapping`, never hard-coded, so the ids below only name the mapping keys. */
export const LIABILITY_MAPPING_KEYS = ["LOAN_PRINCIPAL", "ACCRUED_INTEREST", "UNAMORTIZED_COSTS"] as const;

export const RESULT_LABEL: Record<ReconciliationResult, string> = {
  RECONCILED: "Reconciled",
  DIFFERENCE: "Difference",
};

export const RESULT_TONE: Record<ReconciliationResult, Tone> = {
  RECONCILED: "success",
  DIFFERENCE: "danger",
};

export const STATEMENT_RESULT_LABEL: Record<StatementResult, string> = {
  AGREES: "Agrees",
  DIFFERS: "Differs",
};

export const STATEMENT_RESULT_TONE: Record<StatementResult, Tone> = {
  AGREES: "success",
  DIFFERS: "danger",
};

/** A peso is "the same" inside half a centavo; anything wider is a real break. */
export const RECONCILIATION_TOLERANCE = 0.005;
