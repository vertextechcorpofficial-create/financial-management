import type {
  CertificateDirection,
  MonthKey,
  PaymentPeriodKey,
  PeriodKey,
  WithholdingIncomeType,
} from "./types";

export const TAX_YEARS = [2023, 2024, 2025, 2026, 2027] as const;

export const QUARTER_KEYS: PeriodKey[] = ["Q1", "Q2", "Q3", "Q4"];

/** Every `period_key` the DDL allows, in filing order. */
export const PERIOD_KEYS: PeriodKey[] = ["Q1", "Q2", "Q3", "Q4", "ANNUAL"];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  Q4: "Q4",
  ANNUAL: "Annual",
};

export const MONTH_KEYS: MonthKey[] = [
  "M01",
  "M02",
  "M03",
  "M04",
  "M05",
  "M06",
  "M07",
  "M08",
  "M09",
  "M10",
  "M11",
  "M12",
];

export const PAYMENT_PERIOD_KEYS: PaymentPeriodKey[] = [...PERIOD_KEYS, ...MONTH_KEYS];

export const PAYMENT_PERIOD_LABELS: Record<PaymentPeriodKey, string> = {
  ...PERIOD_LABELS,
  M01: "January",
  M02: "February",
  M03: "March",
  M04: "April",
  M05: "May",
  M06: "June",
  M07: "July",
  M08: "August",
  M09: "September",
  M10: "October",
  M11: "November",
  M12: "December",
};

/** The period a lock has to cover in order to freeze this filing. */
export function lockPeriodOf(period: PaymentPeriodKey): PeriodKey {
  if (period === "ANNUAL" || period.startsWith("Q")) return period as PeriodKey;
  const month = Number(period.slice(1));
  return `Q${Math.floor((month - 1) / 3) + 1}` as PeriodKey;
}

/** A certificate matches when it lands within this many pesos of the ledger figure. */
export const MATCH_TOLERANCE = 1;

export const DIRECTIONS: CertificateDirection[] = ["RECEIVED", "ISSUED"];

export const DIRECTION_LABELS: Record<CertificateDirection, string> = {
  RECEIVED: "Received (from customer / payor)",
  ISSUED: "Issued (to supplier / payee)",
};

/** What each direction means, in the words a preparer uses. */
export const DIRECTION_DESCRIPTIONS: Record<CertificateDirection, string> = {
  RECEIVED: "A customer or payor withheld tax from you. The credit is an asset.",
  ISSUED: "You withheld tax from a supplier or payee. The liability is yours to remit.",
};

/** Doc Table 5 — withholding rates as fractions of the income amount. */
export const WITHHOLDING_RATES: Record<WithholdingIncomeType, number> = {
  RENT: 0.05,
  FEE: 0.15,
  SERVICES: 0.02,
  CONSTRUCTION: 0.02,
  GOODS: 0.01,
  OTHER: 0,
};

export const WITHHOLDING_LABELS: Record<WithholdingIncomeType, string> = {
  RENT: "Rent",
  FEE: "Management / professional fee",
  SERVICES: "Services",
  CONSTRUCTION: "Construction contract",
  GOODS: "Goods",
  OTHER: "Other",
};

export const INCOME_TYPE_OPTIONS = (Object.keys(WITHHOLDING_LABELS) as WithholdingIncomeType[]).map((value) => ({
  value,
  label: WITHHOLDING_LABELS[value],
}));

/**
 * What a company can owe and remit. A 2307 is a certificate, not a payment, so it is
 * deliberately absent even though the entity-worksheet list carries it.
 */
export const BIR_FORMS = [
  "1702Q",
  "1702",
  "2550Q",
  "2551Q",
  "0619-E",
  "1601-EQ",
  "1601-C",
  "1604-C",
  "1604-E",
] as const;

/**
 * Every rate a 2307 may carry, as a percent of the VAT-exclusive income. A figure outside this
 * list means the withheld amount was computed on a different base, so it is not a 2307 rate.
 */
export const STATUTORY_RATES_PERCENT = [1, 2, 5, 10, 15] as const;

export function isStatutoryRate(percent: number): boolean {
  return STATUTORY_RATES_PERCENT.some((rate) => Math.abs(percent - rate) < 0.005);
}

/** The statutory rate a derived percent sits within rounding distance of, or null. */
export function statutoryRateNear(percent: number): number | null {
  return STATUTORY_RATES_PERCENT.find((rate) => Math.abs(percent - rate) <= 0.06) ?? null;
}

/**
 * Forms that can be recorded as a tax payment. A 2307 is a certificate, not a return, so it is
 * absent here even though it appears in the tax calendar's filing list.
 */
export const PAYMENT_FORMS = [...BIR_FORMS, "SEC", "RPT", "LGU"] as const;

/**
 * Periods a form can be filed for, per the taxation doc: 1601-C monthly (P98); 0619-E only in
 * months 1 and 2 of a quarter, because the quarter-end month files the 1601-EQ instead (P98, P105);
 * 1601-EQ / 2550Q / 2551Q quarterly (P104, P105); 1702Q Q1-Q3 only since Q4 is settled by the annual
 * (P106); 1702 annual only (P112); 2307 certificates quarterly, never annual (P78).
 */
const MONTHLY_FORMS = ["1601-C"];
const FIRST_TWO_MONTHS_ONLY = ["0619-E"];
const QUARTERLY_FORMS = ["1601-EQ", "2550Q", "2551Q", "2307"];
const THREE_QUARTER_FORMS = ["1702Q"];
const ANNUAL_FORMS = ["1702"];
/** Months whose expanded-withholding filing is the 1601-EQ, so 0619-E never covers them. */
const QUARTER_END_MONTHS = new Set<MonthKey>(["M03", "M06", "M09", "M12"]);

export function periodsForForm(formCode: string): PaymentPeriodKey[] {
  if (MONTHLY_FORMS.includes(formCode)) return MONTH_KEYS;
  if (FIRST_TWO_MONTHS_ONLY.includes(formCode)) {
    return MONTH_KEYS.filter((key) => !QUARTER_END_MONTHS.has(key));
  }
  if (QUARTERLY_FORMS.includes(formCode)) return PERIOD_KEYS.filter((key) => key !== "ANNUAL");
  if (THREE_QUARTER_FORMS.includes(formCode)) return ["Q1", "Q2", "Q3"];
  if (ANNUAL_FORMS.includes(formCode)) return ["ANNUAL"];
  return PAYMENT_PERIOD_KEYS;
}


/** First and last day of a quarter, as `YYYY-MM-DD`. */
export function quarterRange(year: number, index: number): { from: string; to: string } {
  const startMonth = index * 3;
  const from = `${year}-${String(startMonth + 1).padStart(2, "0")}-01`;
  const endDay = new Date(Date.UTC(year, startMonth + 3, 0)).getUTCDate();
  const to = `${year}-${String(startMonth + 3).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
  return { from, to };
}

/** Quarter index (0..3) of a `YYYY-MM-DD` day, or null when the date is unusable. */
export function quarterOf(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-\d{2}/.exec(value ?? "");
  if (!match) return null;
  const month = Number(match[2]);
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return Math.min(3, Math.floor((month - 1) / 3));
}

/** True when every day of the quarter is already behind the PHT calendar day. */
export function isQuarterPast(year: number, index: number, today: string): boolean {
  const { to } = quarterRange(year, index);
  return to < today;
}

export type Tone = "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  danger: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
  neutral: "border-border bg-muted/40 text-muted-foreground",
};

export function toneClass(tone: Tone): string {
  return TONE_CLASS[tone];
}

export function statusTone(status: string): Tone {
  switch (status.toUpperCase()) {
    case "LOCKED":
    case "FILED":
    case "PAID":
    case "MATCHED":
      return "success";
    case "DUE":
    case "SHORT":
    case "NOT_ENTERED":
      return "warning";
    case "OVERDUE":
    case "OVER":
      return "danger";
    case "OPEN":
    case "UPCOMING":
      return "info";
    default:
      return "neutral";
  }
}

export function statusLabel(status: string): string {
  return status
    .toLowerCase()
    .split(/[_\s]+/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/** Doc Table 6 vocabulary: a 2307 period is matched, short, over, not received or not due yet. */
const CERTIFICATE_STATUS_LABELS: Record<string, string> = {
  MATCHED: "Matched",
  SHORT: "Short",
  OVER: "Over",
  NOT_ENTERED: "Not received",
  UPCOMING: "Not due yet",
  UNKNOWN: "Not compared",
};

/** Compact labels for the certificate status chip. */
export function certificateStatusLabel(status: string): string {
  return CERTIFICATE_STATUS_LABELS[status.toUpperCase()] ?? statusLabel(status);
}

/** Lock state vocabulary: a period is locked, unlocked again, or not locked yet. */
export function lockStateLabel(state: string): string {
  switch (state.toUpperCase()) {
    case "LOCKED":
      return "Locked";
    case "OPEN":
      return "Unlocked";
    default:
      return "Not locked";
  }
}

/**
 * Some rows store the rate as a fraction (0.05) and others as a percent (2), so the stored number
 * cannot be printed as-is. Income and withheld always agree, so the percent is read from them.
 */
export function effectiveRatePercent(incomeAmount: number, taxWithheld: number, storedRate: number): number {
  if (incomeAmount > 0) return (taxWithheld / incomeAmount) * 100;
  return storedRate;
}

/** Page size for the client-side tables, matching the treasury module. */
export const PAGE_SIZE = 10;

