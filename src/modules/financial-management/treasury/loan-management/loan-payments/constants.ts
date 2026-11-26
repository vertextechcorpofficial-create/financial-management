import type { PaymentKind, PaymentMethod, PaymentStatus } from "./types";

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

export const PAYMENT_PAGE_SIZE = 10;

export const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "CHECK", "TRANSFER", "EWALLET"];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CHECK: "Check",
  TRANSFER: "Bank transfer",
  EWALLET: "E-wallet",
};

export const PAYMENT_KINDS: PaymentKind[] = ["NORMAL", "CATCH_UP"];
export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  NORMAL: "Regular installment",
  CATCH_UP: "Catch-up payment",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  POSTED: "Posted",
  REVERSED: "Reversed",
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, Tone> = {
  POSTED: "success",
  REVERSED: "danger",
};

export const BUCKET_LABEL = {
  PENALTY: "Penalty",
  INTEREST: "Interest",
  PRINCIPAL: "Principal",
  ADVANCE: "Held as advance",
} as const;

/** Checks need a number and a date before they can be posted; the form gates on this. */
export const CHECK_METHODS: PaymentMethod[] = ["CHECK"];

/**
 * The loan vocabulary the payment screens read.
 *
 * The loan tree keeps one vocabulary copy per module, so these are the strings the register
 * writes, repeated here rather than imported across module folders. Keys stay plain strings:
 * the column comes back from the database, and an unknown value must still render.
 */
export const LOAN_STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: "Pending approval",
  REJECTED: "Rejected",
  PENDING_RELEASE: "Awaiting release",
  CURRENT: "Current",
  OVERDUE: "Overdue",
  PAID_OFF: "Paid off",
  PREPAID: "Prepaid in full",
};

export const LOAN_STATUS_TONE: Record<string, Tone> = {
  PENDING_APPROVAL: "info",
  REJECTED: "danger",
  PENDING_RELEASE: "warning",
  CURRENT: "success",
  OVERDUE: "danger",
  PAID_OFF: "neutral",
  PREPAID: "neutral",
};

/**
 * The statuses this filter offers. PENDING_RELEASE is retired as a stage (approval now posts
 * the release), so it stays out of the options, but LOAN_STATUS_LABEL keeps the entry above so
 * an older row still prints "Awaiting release" instead of the raw key.
 */
export const LOAN_STATUSES = [
  "PENDING_APPROVAL",
  "REJECTED",
  "CURRENT",
  "OVERDUE",
  "PAID_OFF",
  "PREPAID",
];

export const LENDER_TYPE_LABEL: Record<string, string> = {
  BANK: "Bank",
  FINANCING: "Financing company",
  GOVERNMENT: "Government",
  RELATED_PARTY: "Related party",
  OTHER: "Other",
};

export const LENDER_TYPES = Object.keys(LENDER_TYPE_LABEL);

export const REPAYMENT_METHOD_LABEL: Record<string, string> = {
  ORDINARY_ANNUITY: "Ordinary annuity",
  ANNUITY_DUE: "Annuity due",
  STRAIGHT_LINE: "Straight-line principal",
  BULLET: "Bullet / interest only",
  FLAT_ADD_ON: "Flat-rate / add-on",
};

export const REPAYMENT_METHODS = Object.keys(REPAYMENT_METHOD_LABEL);

/** Installment readings the workspace pills filter by. */
export const INSTALLMENT_FILTERS = ["ALL", "OVERDUE", "UNPAID", "PAID"] as const;
export type InstallmentFilter = (typeof INSTALLMENT_FILTERS)[number];
export const INSTALLMENT_FILTER_LABEL: Record<InstallmentFilter, string> = {
  ALL: "All",
  OVERDUE: "Overdue",
  UNPAID: "Unpaid",
  PAID: "Paid",
};

export const INSTALLMENT_STATUS_LABEL: Record<string, string> = {
  OVERDUE: "Overdue",
  DUE: "Due",
  UPCOMING: "Upcoming",
  PARTLY_PAID: "Partly paid",
  PAID: "Paid",
};

export const INSTALLMENT_STATUS_TONE: Record<string, Tone> = {
  OVERDUE: "danger",
  DUE: "warning",
  UPCOMING: "neutral",
  PARTLY_PAID: "info",
  PAID: "success",
};
