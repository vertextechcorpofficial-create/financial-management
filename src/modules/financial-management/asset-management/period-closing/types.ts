export interface PeriodCloseRecord {
  ym: string; // "2026-10"
  label: string; // "Oct 2026"
  status: "Closed" | "Current" | "Open";
  closedBy?: string | null;
  closedAt?: string | null;
  depreciation: number;
  impairmentNet?: number | null;
  disposalGainLoss?: number | null;
}

export interface PostingRow {
  account: string;
  costCentre: string;
  debit: number;
  credit: number;
  isTotal?: boolean;
}

export interface CloseCheckItem {
  ok: boolean;
  text: string;
  isSoftWarning?: boolean;
}

export interface PeriodCloseData {
  closedThrough: string | null; // e.g. "2026-10"
  closedThroughLabel: string;
  openPeriod: string; // e.g. "2026-11"
  openPeriodLabel: string;
  lastClosedBy: string | null; // e.g. "Liza Tan · Nov 5, 2026, 10:12 AM"
  postedVsRegister: "Reconciled" | "Variance";
  varianceCount: number;
  reportingDate: string; // "2026-11-16"
  months: PeriodCloseRecord[];
  targetToClose: string | null;
  closeOptions: { label: string; value: string }[];
  checks: CloseCheckItem[];
  isYearEnd: boolean;
  canClose: boolean;
  postingDetails: Record<string, PostingRow[]>;
}
