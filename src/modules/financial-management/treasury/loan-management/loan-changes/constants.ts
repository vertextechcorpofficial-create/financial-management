import type { ChangeKind, ChangeStatus, PrepaymentOption } from "./types";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
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
