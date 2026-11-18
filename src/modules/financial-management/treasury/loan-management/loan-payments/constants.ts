import type { PaymentKind, PaymentMethod, PaymentStatus } from "./types";

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
