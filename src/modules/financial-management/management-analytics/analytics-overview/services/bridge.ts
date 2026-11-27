import type { BridgeEntity, CompanyRow, KpiRow, OverviewBridge } from "../types";

/**
 * Intercompany sales removed from gross revenue, ₱M a year, from the specification.
 *
 * ponytail: mirrored from `ELIMINATIONS` in analytics-scenario/services/model.ts so a screen
 * can be read without following a cross-module import. The two must move together: the bridge
 * here and the planner total there have to land on the same consolidated revenue.
 */
export const ELIMINATIONS = 599;
/** Holdings charges the group one percent of consolidated revenue. */
export const HOLDINGS_CHARGE_PCT = 1;

interface Input {
  asOf: string;
  companies: CompanyRow[];
  kpis: KpiRow[];
  settings: Map<string, string>;
  /** `kpiId|period` to the value recorded for it, as the overview already loaded them. */
  actuals: Map<string, { value: number }>;
}

function settingNumber(settings: Map<string, string>, key: string): number | null {
  const raw = settings.get(key);
  if (raw === undefined || raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function kpiFor(kpis: KpiRow[], companyId: number, slug: string): KpiRow | undefined {
  return kpis.find((kpi) => kpi.company_id === companyId && kpi.kpi_key.endsWith(`.${slug}`));
}

function reading(actuals: Map<string, { value: number }>, kpi: KpiRow | undefined, period: string): number | null {
  if (!kpi) return null;
  const cell = actuals.get(`${kpi.id}|${period}`);
  return cell ? cell.value : null;
}

/**
 * Revenue per company is a setting (`baseline_revenue_<code>`), not a KPI reading: the module
 * stores margins, cycles and costs as monthly measures and carries revenue as an annual budget
 * baseline. EBITDA therefore annualises the month's margin and cost: revenue × margin − cost × 12.
 * A company missing either side yields null, which the screen prints as "not reported".
 */
function bridgeEntity(input: Input, company: CompanyRow): BridgeEntity {
  const revenue = settingNumber(input.settings, `baseline_revenue_${company.code}`);
  const cmKpi = kpiFor(input.kpis, company.id, "cm");
  const opexKpi = kpiFor(input.kpis, company.id, "opex");
  const cmPct = reading(input.actuals, cmKpi, input.asOf);
  const opexMonthly = reading(input.actuals, opexKpi, input.asOf);
  const ebitda = revenue !== null && cmPct !== null && opexMonthly !== null ? (revenue * cmPct) / 100 - opexMonthly * 12 : null;

  const missing: string[] = [];
  if (revenue === null) missing.push("no revenue baseline");
  if (cmPct === null) missing.push("no margin reading");
  if (opexMonthly === null) missing.push("no cost reading");

  const basis =
    cmPct !== null && opexMonthly !== null && missing.length === 0
      ? `Baseline revenue, ${cmPct.toFixed(2)}% margin and ₱${opexMonthly.toFixed(2)}M a month at ${input.asOf}`
      : `${missing.join(", ")} for ${input.asOf}, so this row is not reported`;

  return { code: company.code, name: company.name, revenue, ebitda, cmPct, opexMonthly, basis };
}

export function buildBridge(input: Input): OverviewBridge {
  const entities = input.companies.filter((row) => row.kind === "OPERATING").map((row) => bridgeEntity(input, row));

  const reportedRows = entities.filter((row) => row.revenue !== null);
  const gross = reportedRows.reduce((total, row) => total + (row.revenue ?? 0), 0);
  const consolidated = gross - ELIMINATIONS;
  const ebitdaRows = entities.filter((row) => row.ebitda !== null);
  const ebitdaSum = ebitdaRows.reduce((total, row) => total + (row.ebitda ?? 0), 0);
  const holdingsFee = (consolidated * HOLDINGS_CHARGE_PCT) / 100;

  const gapKpi = input.kpis.find((kpi) => kpi.kpi_key === "grp-hold.icgap");
  const gapValue = reading(input.actuals, gapKpi, input.asOf);
  const gap =
    gapKpi && gapValue !== null && gapKpi.threshold !== null
      ? { value: gapValue, ceiling: gapKpi.threshold, period: input.asOf }
      : null;

  // A missing row is the one thing that stops this bridge from tying, and 0 would hide it as an
  // entity that earned nothing. Say which companies are short instead.
  const gaps: string[] = [];
  if (reportedRows.length < entities.length) {
    const missing = entities.filter((row) => row.revenue === null).map((row) => row.code);
    gaps.push(
      `${missing.length} of ${entities.length} companies carry no revenue baseline (${missing.join(", ")}), so the sum covers the rest.`,
    );
  }
  if (ebitdaRows.length < entities.length) {
    const missing = entities.filter((row) => row.ebitda === null).map((row) => row.code);
    gaps.push(
      `${missing.length} of ${entities.length} companies have no margin or cost reading at ${input.asOf} (${missing.join(", ")}), so the EBITDA sum is short by their contribution.`,
    );
  }

  return {
    asOf: input.asOf,
    entities,
    reported: reportedRows.length,
    total: entities.length,
    gross,
    eliminations: ELIMINATIONS,
    consolidated,
    ebitdaSum,
    holdingsFee,
    groupEbitda: ebitdaSum - holdingsFee,
    gap,
    untied: gaps.length > 0 ? gaps.join(" ") : null,
  };
}
