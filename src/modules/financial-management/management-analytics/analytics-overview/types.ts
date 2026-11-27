export type Polarity = "HIGH" | "LOW";
export type RuleType = "PCT" | "MAX" | "MIN";
export type Tier = "CORE" | "WORKFORCE" | "INDUSTRY" | "HOLDINGS";
export type Rollup = "SUM" | "REVW" | "HEADCOUNT" | "COMPANY";

export interface CompanyRow {
  id: number;
  code: string;
  name: string;
  kind: string;
  parent_code: string | null;
  industry: string | null;
  revenue_weight: number | null;
  currency: string;
  fx_to_php: number;
  headcount: number;
  sort: number;
  is_active: boolean;
}

export interface KpiRow {
  id: number;
  kpi_key: string;
  name: string;
  domain: string;
  tier: Tier;
  company_id: number;
  unit: string | null;
  polarity: Polarity;
  rule_type: RuleType;
  threshold: number | null;
  watch_band: number | null;
  dp: number;
  rollup: Rollup;
  owner_position: string | null;
  source_codes: string | null;
  definition: string | null;
  sort: number;
  is_active: boolean;
}

/** One month of a KPI: the target in force and what was actually recorded. */
export interface PeriodPoint {
  period: string;
  actual: number | null;
  target: number | null;
}

export interface KpiSeries {
  kpi: KpiRow;
  points: PeriodPoint[];
  /** Index of the period being judged (the newest point with an actual). */
  index: number;
}

export type StatusCode = "ON_TRACK" | "WATCH" | "PROVISIONAL" | "CONFIRMED" | "FAVORABLE" | "NO_DATA";

export interface Deviation {
  /** Signed deviation in the rule's own units: percent for PCT, absolute otherwise. */
  value: number;
  text: string;
  unfavorable: boolean;
  over: boolean;
  watch: boolean;
  /** Deviation as a multiple of the threshold: used by the spike override. */
  ratio: number;
}

export interface RunInfo {
  start: number;
  length: number;
  confirmedAt: number | null;
  reason: string;
  deviation: Deviation;
}

export interface KpiStatus {
  code: StatusCode;
  label: string;
  memoRequired: boolean;
  deviation: Deviation | null;
  run: RunInfo | null;
}

export interface Policy {
  seasonalTargets: boolean;
  sustainedRule: boolean;
  confirmPeriods: number;
  spikeMultiple: number;
  memoDeadlineDays: number;
  toleranceReadings: number;
}

export interface ExceptionRow {
  id: number;
  company_id: number;
  kpi_id: number;
  period_start: string;
  period_end: string;
  status: string;
  reason: string | null;
  owner_user_id: number | null;
  memo_due_date: string | null;
  memo_at: string | null;
  memo: string | null;
  escalated_level: number;
  relative_pct: number;
  deviation: number;
  direction: string;
  identity_key: string;
}

export interface OverviewRow {
  kpi: KpiRow;
  status: KpiStatus;
  actual: number | null;
  target: number | null;
  period: string | null;
  stale: boolean;
  missingTarget: boolean;
  missingActual: boolean;
  /** Up to 24 months of history for Sparklines, 12-month calendar, and 4-tier drill-down drawer. */
  points: PeriodPoint[];
}

export interface CompanyScorecardRow {
  id: number;
  code: string;
  name: string;
  industry: string;
  revenueWeight: number | null;
  health: number | null;
  onTrack: number;
  watch: number;
  breach: number;
  escalated: number;
  topIssue: { kpiName: string; varianceText: string } | null;
}

export interface HeatCellItem {
  code: string;
  status: StatusCode;
  varianceText: string | null;
  unfavorable: boolean;
  confirmed: boolean;
}

/** One company's row in the consolidation bridge. Money is ₱M a year. */
export interface BridgeEntity {
  code: string;
  name: string;
  /**
   * Baseline revenue from the settings, or null when the company has none. Never zero:
   * a missing baseline is a gap in the bridge, not a company that earned nothing.
   */
  revenue: number | null;
  /** Annualised EBITDA from the month's readings, or null when a reading is missing. */
  ebitda: number | null;
  cmPct: number | null;
  opexMonthly: number | null;
  /** Where those figures came from, printed under the row. */
  basis: string;
}

export interface OverviewBridge {
  asOf: string;
  entities: BridgeEntity[];
  /** Companies carrying a revenue figure, out of every operating company. */
  reported: number;
  total: number;
  gross: number;
  eliminations: number;
  consolidated: number;
  /** Entity EBITDA before the Holdings fee, then after it. */
  ebitdaSum: number;
  holdingsFee: number;
  groupEbitda: number;
  /** Intercompany imbalance as the group records it, with the ceiling it is held to. */
  gap: { value: number; ceiling: number; period: string } | null;
  /** What keeps the bridge from tying, in words. Null when every row is present. */
  untied: string | null;
}

export interface OverviewPayload {
  asOf: string;
  companies: CompanyRow[];
  company: CompanyRow | null;
  rows: OverviewRow[];
  health: number | null;
  counts: Record<StatusCode, number>;
  exceptions: Array<ExceptionRow & { kpiName: string; companyName: string }>;
  /** Per-company health summary for the group Company Scorecard table. */
  companyScorecard: CompanyScorecardRow[];
  /** Core KPIs across every operating company, for the heatmap. */
  heat: Array<{ kpiKey: string; kpiName: string; cells: HeatCellItem[] }>;
  sources: Array<{ code: string; name: string; state: string; last_sync_at: string | null; sla_minutes: number; stale: boolean }>;
  /**
   * Revenue and EBITDA per company reconciled to the consolidated figure. Built only for the
   * group view, which is the only scope where consolidation means anything.
   */
  bridge: OverviewBridge | null;
}
