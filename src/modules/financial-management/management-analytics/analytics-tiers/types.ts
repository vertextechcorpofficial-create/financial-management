import type { Forecast } from "./services/engine";

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

/** An exception with the names its table needs, so a row never shows a bare id. */
export interface ExceptionListRow extends ExceptionRow {
  memo_by: number | null;
  escalated_at: string | null;
  closed_at: string | null;
  close_note: string | null;
  companyCode: string;
  companyName: string;
  kpiKey: string;
  kpiName: string;
  unit: string | null;
  dp: number;
}

export interface ExceptionReadingRow {
  id: number;
  exception_id: number;
  period: string;
  value: number;
  deviation: number;
  over_limit: boolean;
  read_at: string | null;
}

export interface ExceptionDetail {
  exception: ExceptionListRow;
  readings: ExceptionReadingRow[];
  kpi: KpiRow | null;
}

export interface ExceptionBoard {
  asOf: string;
  companies: CompanyRow[];
  counts: Record<string, number>;
  open: number;
  overdue: number;
  total: number;
  page: number;
  size: number;
  rows: ExceptionListRow[];
}

export interface VarianceScanResult {
  period: string;
  scanned: number;
  created: number;
  skipped: number;
  touched: string[];
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
}

export interface OverviewPayload {
  asOf: string;
  companies: CompanyRow[];
  company: CompanyRow | null;
  rows: OverviewRow[];
  health: number | null;
  counts: Record<StatusCode, number>;
  exceptions: Array<ExceptionRow & { kpiName: string; companyName: string }>;
  /** Core KPIs across every operating company, for the heatmap. */
  heat: Array<{ kpiKey: string; kpiName: string; cells: Array<{ code: string; status: StatusCode }> }>;
  sources: Array<{ code: string; name: string; state: string; last_sync_at: string | null; sla_minutes: number; stale: boolean }>;
}

/** One KPI as the catalogue lists it, with the reading and status in force. */
export interface CatalogRow {
  kpi: KpiRow;
  companyCode: string;
  companyName: string;
  period: string | null;
  actual: number | null;
  actualText: string;
  targetText: string;
  rule: string;
  statusCode: StatusCode;
  statusLabel: string;
  change: number | null;
  memoRequired: boolean;
}

export interface CatalogCounts {
  CORE: number;
  WORKFORCE: number;
  INDUSTRY: number;
  HOLDINGS: number;
}

export interface CatalogPayload {
  rows: CatalogRow[];
  total: number;
  counts: CatalogCounts;
  companies: Array<{ id: number; code: string; name: string }>;
  domains: string[];
  period: string | null;
  page: number;
  size: number;
}

export interface CatalogDetail {
  row: CatalogRow;
  points: PeriodPoint[];
  status: KpiStatus;
  forecast: Forecast | null;
}
