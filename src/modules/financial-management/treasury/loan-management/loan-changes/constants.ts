import type { ChangeKind, ChangeStatus, PrepaymentOption } from "./types";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  // Red and primary cannot carry their own hue as 11px text on a 15% wash: measured 3.11:1
  // (light) and 2.38:1 (dark) for destructive, 5.70 / 3.57 for primary. The wash keeps the
  // colour, the text uses the foreground token: 16.34 / 17.13 and 17.06 / 16.91. Success,
  // warning and info keep their hue because they pass in the dark theme the QA measures.
  danger: "bg-destructive/15 text-foreground ring-1 ring-inset ring-destructive/40",
  info: "bg-info/15 text-info",
  accent: "bg-primary/10 text-foreground ring-1 ring-inset ring-primary/40",
};

/** One accent per page, borrowed from the treasury family so loan pages read as siblings. */
export const ACCENT = {
  rail: "border-t-primary/40",
  tile: "border-l-primary/60 from-primary/5",
} as const;

export function toneClass(tone: Tone): string {
  return TONE_CLASS[tone];
}

export const CHANGE_PAGE_SIZE = 10;
export const CHANGE_PAGE_SIZE_STORAGE_KEY = "fm.loan-changes.rows";

export const CHANGE_KINDS: ChangeKind[] = ["PREPAYMENT", "RATE_CHANGE", "RESTRUCTURE", "PAYOFF"];

export const CHANGE_KIND_LABEL: Record<ChangeKind, string> = {
  PREPAYMENT: "Prepayment",
  RATE_CHANGE: "Rate change",
  RESTRUCTURE: "Restructure",
  PAYOFF: "Payoff",
};

export const CHANGE_KIND_TONE: Record<ChangeKind, Tone> = {
  PREPAYMENT: "info",
  RATE_CHANGE: "accent",
  RESTRUCTURE: "warning",
  PAYOFF: "success",
};

export const CHANGE_KIND_HINT: Record<ChangeKind, string> = {
  PREPAYMENT: "Pays part of the principal early. The remaining schedule is rebuilt.",
  RATE_CHANGE: "Resets the rate from the effective date and rebuilds what is left.",
  RESTRUCTURE: "New rate and/or term. The 10% present-value test decides the accounting.",
  PAYOFF: "Closes the loan: the quote is the cash that settles everything outstanding.",
};

export const CHANGE_STATUS_LABEL: Record<ChangeStatus, string> = {
  POSTED: "Posted",
  REVERSED: "Reversed",
};

export const CHANGE_STATUS_TONE: Record<ChangeStatus, Tone> = {
  POSTED: "success",
  REVERSED: "neutral",
};

export const PREPAYMENT_OPTIONS: PrepaymentOption[] = ["SHORTEN_TERM", "LOWER_INSTALLMENT"];

export const PREPAYMENT_OPTION_LABEL: Record<PrepaymentOption, string> = {
  SHORTEN_TERM: "Shorten the term (keep the installment)",
  LOWER_INSTALLMENT: "Lower the installment (keep the periods)",
};

/** Loans a change may touch; anything else is refused with a sentence. */
export const CHANGEABLE_STATUSES = ["CURRENT", "OVERDUE"];

/** Rounding tolerance for money comparisons. */
export const MONEY_TOLERANCE = 0.005;

/** The restructuring test threshold from the document: 10%. */
export const RESTRUCTURE_THRESHOLD_PCT = 10;
