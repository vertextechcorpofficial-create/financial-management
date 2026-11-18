import type { EntryStatus, EntryType } from "./types";

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

export const JOURNAL_PAGE_SIZE = 10;
export const JOURNAL_PAGE_SIZE_STORAGE_KEY = "fm.loan-journal.rows";

export const ENTRY_TYPES: EntryType[] = [
  "RELEASE",
  "INTEREST_ACCRUAL",
  "PAYMENT",
  "CHECK_ENCASHMENT",
  "PREPAYMENT",
  "RESTRUCTURE",
  "PAYOFF",
  "INVESTMENT_INCOME",
  "MONTH_END_ACCRUAL",
  "MONTH_END_REVERSAL",
  "DST_REMITTANCE",
];

/** Lowercase sentence for the picker; the enum token never reaches the screen. */
export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  RELEASE: "Release",
  INTEREST_ACCRUAL: "Interest accrual",
  PAYMENT: "Payment",
  CHECK_ENCASHMENT: "Check encashment",
  PREPAYMENT: "Prepayment",
  RESTRUCTURE: "Restructure",
  PAYOFF: "Payoff",
  INVESTMENT_INCOME: "Investment income",
  MONTH_END_ACCRUAL: "Month-end accrual",
  MONTH_END_REVERSAL: "Month-end reversal",
  DST_REMITTANCE: "DST remittance",
};

export const ENTRY_TYPE_TONE: Record<EntryType, Tone> = {
  RELEASE: "info",
  INTEREST_ACCRUAL: "warning",
  PAYMENT: "success",
  CHECK_ENCASHMENT: "success",
  PREPAYMENT: "info",
  RESTRUCTURE: "accent",
  PAYOFF: "accent",
  INVESTMENT_INCOME: "success",
  MONTH_END_ACCRUAL: "warning",
  MONTH_END_REVERSAL: "neutral",
  DST_REMITTANCE: "neutral",
};

export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  POSTED: "Posted",
  REVERSED: "Reversed",
};

export const ENTRY_STATUS_TONE: Record<EntryStatus, Tone> = {
  POSTED: "success",
  REVERSED: "neutral",
};

/** Cents. Two figures within this are the same figure. */
export const BALANCE_TOLERANCE = 0.005;
