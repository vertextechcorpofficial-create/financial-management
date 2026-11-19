import type { AccountKind, HolidayKind } from "./types";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

/**
 * Badge colours stay on the design tokens: a tint and a matching border, with the label in
 * foreground ink so an 11px pill still reads in both themes. No palette classes, no hex.
 */
export const TONE_CLASS: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  success: "border-success/40 bg-success/10 text-foreground",
  warning: "border-warning/40 bg-warning/10 text-foreground",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  info: "border-info/40 bg-info/10 text-foreground",
  accent: "border-primary/40 bg-primary/10 text-primary",
};

/** One accent per page, borrowed from the treasury family so loan pages read as siblings. */
export const ACCENT = "border-t-primary/40";

export function toneClass(tone: Tone): string {
  return TONE_CLASS[tone];
}

export const SETTINGS_PAGE_SIZE = 10;

export const ACCOUNT_KINDS: AccountKind[] = ["BANK", "CASH", "EWALLET"];
export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  BANK: "Bank account",
  CASH: "Cash on hand",
  EWALLET: "E-wallet",
};

export const HOLIDAY_KINDS: HolidayKind[] = ["REGULAR", "SPECIAL", "LOCAL"];
export const HOLIDAY_KIND_LABEL: Record<HolidayKind, string> = {
  REGULAR: "Regular holiday",
  SPECIAL: "Special (non-working)",
  LOCAL: "Local holiday",
};

export const HOLIDAY_KIND_TONE: Record<HolidayKind, Tone> = {
  REGULAR: "info",
  SPECIAL: "warning",
  LOCAL: "neutral",
};

/** One line per mapping key: what stops working while the key has no account. */
export const MAPPING_BLOCKS: Record<string, string> = {
  LOAN_PRINCIPAL:
    "Release, payoff and restructure entries credit this account. Unmapped, a loan cannot be released.",
  UNAMORTIZED_COSTS:
    "The fee and DST withheld at release sit here. Unmapped, a release with fees cannot post.",
  CAPITALIZED_BORROWING_COSTS: "Capitalized borrowing costs accrue to this account on month-end runs.",
  DST_PAYABLE: "Only used when the company pays the documentary stamp tax itself instead of the lender withholding it.",
  CHECKS_UNCLEARED: "A release or payment by check parks the money here until the check clears.",
  ACCRUED_INTEREST: "Interest accrues here between payment dates. Unmapped, accrual entries cannot post.",
  INTEREST_EXPENSE: "Interest and amortized cost are charged here on each interest entry.",
  INVESTMENT_INCOME: "PAS 23 and suspense income post here.",
  ADVANCE_TO_LENDER: "Money held with the lender after an over-payment sits here.",
  PENALTY_EXPENSE: "Late-payment penalties charge here. Unmapped, a payment with penalties cannot post.",
  PREPAYMENT_PENALTY_EXPENSE: "Prepayment charges on a payoff post here.",
  MODIFICATION_LOSS: "A restructure that loses value posts the difference here.",
  MODIFICATION_GAIN: "A restructure that gains value posts the difference here.",
  BANK_CHARGE:
    "What a payment channel charges, when its percentage is above zero. It is added to the money the borrower pays, so an unmapped key blocks a payment that carries a charge.",
};

export const MAPPING_SECTIONS: { title: string; keys: string[] }[] = [
  {
    title: "The loan and its release",
    keys: ["LOAN_PRINCIPAL", "UNAMORTIZED_COSTS", "CAPITALIZED_BORROWING_COSTS", "DST_PAYABLE", "CHECKS_UNCLEARED"],
  },
  {
    title: "Interest, income and advance",
    keys: ["INTEREST_EXPENSE", "ACCRUED_INTEREST", "INVESTMENT_INCOME", "ADVANCE_TO_LENDER", "BANK_CHARGE"],
  },
  {
    title: "Penalties and changes",
    keys: ["PENALTY_EXPENSE", "PREPAYMENT_PENALTY_EXPENSE", "MODIFICATION_LOSS", "MODIFICATION_GAIN"],
  },
];

export const MAPPING_LABELS: Record<string, string> = {
  LOAN_PRINCIPAL: "Loans payable — principal",
  UNAMORTIZED_COSTS: "Unamortized debt issue costs",
  CAPITALIZED_BORROWING_COSTS: "Capitalized borrowing costs",
  DST_PAYABLE: "Documentary stamp tax payable",
  BANK_CHARGE: "Bank and payment charges",
  CHECKS_UNCLEARED: "Checks uncleared",
  INTEREST_EXPENSE: "Interest expense",
  ACCRUED_INTEREST: "Accrued interest payable",
  INVESTMENT_INCOME: "Investment income",
  ADVANCE_TO_LENDER: "Advance to lender",
  PENALTY_EXPENSE: "Penalty expense",
  PREPAYMENT_PENALTY_EXPENSE: "Prepayment penalty expense",
  MODIFICATION_LOSS: "Modification loss",
  MODIFICATION_GAIN: "Modification gain",
};

export function mappingLabel(key: string): string {
  return MAPPING_LABELS[key] ?? key.replace(/_/g, " ").toLowerCase();
}

/** The one line the lock dialog shows under its title. */
export const LOCK_BLOCKS =
  "Nothing dated on or before this date can be posted.";
