import { formatCurrency } from "@/lib/utils";

/**
 * Money for the journal. A negative keeps the true minus (U+2212), never the ASCII hyphen the
 * currency formatter would otherwise pair with the peso sign.
 */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const formatted = formatCurrency(Math.abs(value));
  return value < -0.005 ? `\u2212${formatted}` : formatted;
}

/** `2026-02-16` for the screen; the column header already says PHT. */
export function shortDate(value: string): string {
  return value ? value.slice(0, 10) : "—";
}
