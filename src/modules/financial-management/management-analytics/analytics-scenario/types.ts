export type CompanyKind = "OPERATING" | "HOLDINGS" | "GROUP";

/** Run-rate a scenario starts from, with the evidence behind each figure. */
export interface BaselineRow {
  code: string;
  name: string;
  kind: CompanyKind;
  /** Annual revenue in ₱M. */
  revenue: number;
  /** Contribution margin, percent of revenue. */
  cmPct: number;
  /** Fixed cost in ₱M a year. */
  fixed: number;
  /** Cash conversion cycle in days. */
  cccDays: number;
  /** Share of cost of sales that is imported, 0 to 1. */
  importShare: number;
  /** Share of revenue invoiced in USD, 0 to 1. */
  usdShare: number;
  /** Where revenue came from, printed beside the number. */
  revenueBasis: string;
  /** Where margin, fixed cost and CCC came from. */
  kpiBasis: string;
}

export interface Levers {
  code: string;
  /** Revenue change, percent. */
  revenuePct: number;
  /** Contribution margin change, percentage points. */
  cmPoints: number;
  /** Fixed cost change, percent. */
  fixedPct: number;
  /** Cash conversion cycle change, days. */
  cccDays: number;
}

export interface CompanyResult {
  code: string;
  name: string;
  kind: CompanyKind;
  revenue: number;
  revenueScenario: number;
  cmPct: number;
  cmAmount: number;
  fixed: number;
  fixedScenario: number;
  ebitda: number;
  ebitdaScenario: number;
  ebitdaDelta: number;
  cccDays: number;
  cccScenario: number;
  workingCapital: number;
  workingCapitalScenario: number;
  workingCapitalDelta: number;
  /** Cash released or absorbed, ₱M: ΔEBITDA after tax less the working capital change. */
  cashEffect: number;
}

export interface ScenarioTotals {
  revenue: number;
  revenueScenario: number;
  ebitda: number;
  ebitdaScenario: number;
  ebitdaDelta: number;
  ebitdaMargin: number;
  workingCapitalDelta: number;
  cashEffect: number;
  cashRunRate: number;
  cashScenario: number;
  /**
   * Movement of the Holdings charge between run-rate and scenario, ₱M a year, positive when the
   * fee rose. The bridge needs it as its own step: the company deltas do not include it, so
   * without this line the steps sum to more than the EBITDA delta the header prints.
   */
  holdingsDelta: number;
}

export interface ScenarioResult {
  fxPct: number;
  eliminations: number;
  holdingsCost: number;
  companies: CompanyResult[];
  totals: ScenarioTotals;
  notes: string[];
}

export interface ScenarioRow {
  id: number;
  name: string;
  base_period: string;
  fx_pct: number;
  levers: unknown;
  note: string | null;
  is_active: boolean | number;
  created_at: string | null;
  created_by: number | null;
}

export interface ScenarioPayload {
  companies: BaselineRow[];
  levers: Levers[];
  result: ScenarioResult;
  scenarios: ScenarioRow[];
  notices: string[];
}
