import { phtToday } from "../analytics-overview/pht";

/**
 * The month list the shared toolbar offers, plus the query key it writes.
 * Screen navigation is the application sidebar's job, so no route list lives here.
 */
export const PERIOD_PARAM = "period";
export const COMPARE_PARAM = "compare";
export const CURRENCY_PARAM = "currency";

export type CompareMode = "target" | "mom" | "yoy" | "ytd";
export type CurrencyCode = "PHP" | "USD";

export const COMPARE_OPTIONS: Array<{ value: CompareMode; label: string }> = [
  { value: "target", label: "vs Target" },
  { value: "mom", label: "vs Prior month" },
  { value: "yoy", label: "vs Last year" },
  { value: "ytd", label: "YTD avg vs Target" },
];

export const TV_ROUTES: Array<{ path: string; label: string }> = [
  { path: "/fm/management-analytics/analytics-overview", label: "Overview" },
  { path: "/fm/management-analytics/analytics-variance", label: "Variance Protocol" },
  { path: "/fm/management-analytics/analytics-cadence", label: "Reporting Cadence" },
];

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isPeriod(value: string | null | undefined): value is string {
  return !!value && MONTH.test(value);
}

/** Newest first, ending with the current PHT month. Matches the 24 months the services read. */
export function recentPeriods(count = 24): string[] {
  const [year, month] = phtToday().split("-").map(Number);
  return Array.from({ length: count }, (_, back) => {
    const date = new Date(Date.UTC(year, month - 1 - back, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}
