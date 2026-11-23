import { listItems } from "./directus";
import { asBoolean, asNumber, asNumberOrNull, asString } from "./directus";
import { DEFAULT_POLICY, healthScore, statusOf } from "./engine";
import { phtToday } from "../pht";
import type {
  CompanyRow,
  ExceptionRow,
  KpiRow,
  KpiStatus,
  OverviewPayload,
  OverviewRow,
  PeriodPoint,
  Policy,
  StatusCode,
} from "../types";

const MONTHS = 24;

interface SettingAll {
  setting_key: string;
  value: string;
}

function loadPolicy(settings: SettingAll[]): Policy {
  const value = (key: string, fallback: number | boolean) => {
    const row = settings.find((s) => s.setting_key === key);
    if (!row) return fallback;
    // Switches are stored as `on` / `off`; the earlier `true`/`1` test read every switch as off.
    if (typeof fallback === "boolean") return ["on", "true", "1", "yes"].includes(row.value.trim().toLowerCase());
    const parsed = Number(row.value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    seasonalTargets: value("seasonal_targets", DEFAULT_POLICY.seasonalTargets) as boolean,
    sustainedRule: value("sustained_rule", DEFAULT_POLICY.sustainedRule) as boolean,
    confirmPeriods: value("confirm_periods", DEFAULT_POLICY.confirmPeriods) as number,
    spikeMultiple: value("spike_multiple", DEFAULT_POLICY.spikeMultiple) as number,
    memoDeadlineDays: value("memo_deadline_days", DEFAULT_POLICY.memoDeadlineDays) as number,
    toleranceReadings: value("tolerance_readings", DEFAULT_POLICY.toleranceReadings) as number,
  };
}

export function mapCompany(row: Record<string, unknown>): CompanyRow {
  return {
    id: asNumber(row.id),
    code: asString(row.code),
    name: asString(row.name),
    kind: asString(row.kind) || "OPERATING",
    parent_code: row.parent_code ? asString(row.parent_code) : null,
    industry: row.industry ? asString(row.industry) : null,
    currency: asString(row.currency) || 'PHP',
    fx_to_php: asNumber(row.fx_to_php, 1),
    revenue_weight: asNumberOrNull(row.revenue_weight),
    headcount: asNumber(row.headcount),
    sort: asNumber(row.sort),
    is_active: asBoolean(row.is_active),
  };
}

function mapKpi(row: Record<string, unknown>): KpiRow {
  return {
    id: asNumber(row.id),
    kpi_key: asString(row.kpi_key),
    name: asString(row.name),
    domain: asString(row.domain),
    tier: asString(row.tier) as KpiRow["tier"],
    company_id: asNumber(row.company_id),
    unit: row.unit ? asString(row.unit) : null,
    polarity: asString(row.polarity) as KpiRow["polarity"],
    rule_type: asString(row.rule_type) as KpiRow["rule_type"],
    threshold: asNumberOrNull(row.threshold),
    watch_band: asNumberOrNull(row.watch_band),
    dp: asNumber(row.dp),
    rollup: asString(row.rollup) as KpiRow["rollup"],
    owner_position: row.owner_position ? asString(row.owner_position) : null,
    source_codes: row.source_codes ? asString(row.source_codes) : null,
    definition: row.definition ? asString(row.definition) : null,
    sort: asNumber(row.sort),
    is_active: asBoolean(row.is_active),
  };
}

function mapException(row: Record<string, unknown>): ExceptionRow {
  return {
    id: asNumber(row.id),
    company_id: asNumber(row.company_id),
    kpi_id: asNumber(row.kpi_id),
    period_start: asString(row.period_start),
    period_end: asString(row.period_end),
    status: asString(row.status),
    reason: row.reason ? asString(row.reason) : null,
    owner_user_id: asNumberOrNull(row.owner_user_id),
    memo_due_date: row.memo_due_date ? asString(row.memo_due_date) : null,
    memo_at: row.memo_at ? asString(row.memo_at) : null,
    escalated_level: asNumber(row.escalated_level),
    direction: asString(row.direction),
    deviation: asNumber(row.deviation),
    relative_pct: asNumber(row.relative_pct),
    memo: row.memo ? asString(row.memo) : null,
    identity_key: asString(row.identity_key),
  } as ExceptionRow;
}

function lastPeriods(asOf: string, count: number): string[] {
  const [year, month] = asOf.split("-").map((part) => Number(part));
  const periods: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - back, 1));
    periods.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return periods;
}

export async function loadOverview(params: { company?: string; asOf?: string }): Promise<OverviewPayload> {
  const asOf = params.asOf && /^\d{4}-\d{2}$/.test(params.asOf) ? params.asOf : phtToday().slice(0, 7);
  const periods = lastPeriods(asOf, MONTHS);

  const [companyRows, kpiRows, settingRows, sourceRows, exceptionRows] = await Promise.all([
    listItems<Record<string, unknown>>("ma_company", { fields: ["id", "code", "name", "kind", "parent_code", "industry", "currency", "fx_to_php", "revenue_weight", "headcount", "sort", "is_active"], sort: ["sort", "code"], limit: 100 }),
    listItems<Record<string, unknown>>("ma_kpi", { fields: ["id", "kpi_key", "name", "domain", "tier", "company_id", "unit", "polarity", "rule_type", "threshold", "watch_band", "dp", "rollup", "owner_position", "source_codes", "definition", "sort", "is_active"], filter: { is_active: { _eq: true } }, sort: ["tier", "sort", "kpi_key"], limit: 400 }),
    listItems<Record<string, unknown>>("ma_setting", { fields: ["setting_key", "value"], limit: 100 }),
    listItems<Record<string, unknown>>("ma_source", { fields: ["code", "name", "state", "last_sync_at", "sla_minutes"], sort: "code", limit: 100 }),
    listItems<Record<string, unknown>>("ma_exception", { fields: ["id", "company_id", "kpi_id", "period_start", "period_end", "status", "reason", "owner_user_id", "memo_due_date", "memo_at", "escalated_level", "direction", "deviation", "relative_pct", "memo"], filter: { status: { _in: ["OPEN", "MONITORING", "ESCALATED", "RECURRENCE"] } }, sort: ["-period_start"], limit: 200 }),
  ]);

  const companies = companyRows.rows.map(mapCompany).filter((row) => row.is_active);
  const kpis = kpiRows.rows.map(mapKpi);
  const policy = loadPolicy(settingRows.rows.map((row) => ({ setting_key: asString(row.setting_key), value: asString(row.value) })));

  const [targetRows, actualRows] = await Promise.all([
    listItems<Record<string, unknown>>("ma_kpi_target", { fields: ["kpi_id", "period", "target"], filter: { period: { _in: periods } }, limit: 6000 }),
    listItems<Record<string, unknown>>("ma_kpi_actual", { fields: ["kpi_id", "period", "value", "basis"], filter: { period: { _in: periods } }, limit: 6000 }),
  ]);

  const targets = new Map<string, number>();
  for (const row of targetRows.rows) targets.set(`${asNumber(row.kpi_id)}|${asString(row.period)}`, asNumber(row.target));
  const actuals = new Map<string, { value: number; basis: string }>();
  for (const row of actualRows.rows) actuals.set(`${asNumber(row.kpi_id)}|${asString(row.period)}`, { value: asNumber(row.value), basis: asString(row.basis) || "ACTUAL" });

  const seriesFor = (kpi: KpiRow): PeriodPoint[] =>
    periods.map((period) => ({
      period,
      target: targets.get(`${kpi.id}|${period}`) ?? null,
      actual: actuals.get(`${kpi.id}|${period}`)?.value ?? null,
    }));

  const indexOfLatestReading = (points: PeriodPoint[]): number => {
    for (let i = points.length - 1; i >= 0; i -= 1) if (points[i].actual !== null) return i;
    return points.length - 1;
  };

  const statusFor = (kpi: KpiRow): { status: KpiStatus; points: PeriodPoint[]; index: number } => {
    const points = seriesFor(kpi);
    const index = indexOfLatestReading(points);
    return { status: statusOf(kpi, points, index, policy), points, index };
  };

  const selectedCode = params.company ?? "grp";
  const company = companies.find((row) => row.code === selectedCode) ?? companies.find((row) => row.code === "grp") ?? companies[0] ?? null;

  const scopedKpis = company
    ? kpis.filter((kpi) => kpi.company_id === company.id || kpi.company_id === 0)
    : kpis;

  const rows: OverviewRow[] = scopedKpis
    .map((kpi) => {
      const { status, points, index } = statusFor(kpi);
      const point = points[index];
      const latestTarget = points.reduce<number | null>((found, p) => (p.target !== null ? p.target : found), null);
      return {
        kpi,
        status,
        actual: point?.actual ?? null,
        target: point?.target ?? latestTarget,
        period: point?.period ?? null,
        stale: point ? point.actual !== null && point.period < periods[periods.length - 1] : false,
        missingActual: point?.actual === null || point?.actual === undefined,
        missingTarget: point?.target === null || point?.target === undefined,
      };
    })
    .sort((a, b) => {
      const tier = ["CORE", "WORKFORCE", "INDUSTRY", "HOLDINGS"];
      const byTier = tier.indexOf(a.kpi.tier) - tier.indexOf(b.kpi.tier);
      return byTier !== 0 ? byTier : a.kpi.sort - b.kpi.sort || a.kpi.kpi_key.localeCompare(b.kpi.kpi_key);
    });

  const counts: Record<StatusCode, number> = { ON_TRACK: 0, WATCH: 0, PROVISIONAL: 0, CONFIRMED: 0, FAVORABLE: 0, NO_DATA: 0 };
  for (const row of rows) counts[row.status.code] += 1;
  const health = healthScore(rows.map((row) => row.status));

  const coreKpis = kpis.filter((kpi) => kpi.tier === "CORE" && kpi.company_id !== 0);
  const coreSlugs = Array.from(new Set(coreKpis.map((kpi) => kpi.kpi_key.split(".").slice(1).join("."))));
  const operating = companies.filter((row) => row.kind === "OPERATING");
  const heat = coreSlugs.map((slug) => {
    const sample = coreKpis.find((kpi) => kpi.kpi_key.endsWith(`.${slug}`));
    return {
      kpiKey: slug,
      kpiName: sample?.name ?? slug,
      cells: operating.map((row) => {
        const kpi = coreKpis.find((candidate) => candidate.company_id === row.id && candidate.kpi_key.endsWith(`.${slug}`));
        if (!kpi) return { code: row.code, status: "NO_DATA" as StatusCode };
        return { code: row.code, status: statusFor(kpi).status.code };
      }),
    };
  });

  const kpiById = new Map(kpis.map((kpi) => [kpi.id, kpi]));
  const companyById = new Map(companies.map((row) => [row.id, row]));
  const exceptions = exceptionRows.rows
    .map((row) => {
      const mapped = mapException(row);
      const kpi = kpiById.get(mapped.kpi_id);
      return {
        ...mapped,
        kpiName: kpi?.name ?? `KPI ${mapped.kpi_id}`,
        companyName: companyById.get(mapped.company_id)?.code ?? String(mapped.company_id),
      };
    })
    .filter((row) => !company || company.id === 0 || row.company_id === company.id);

  const now = Date.now();
  const sources = sourceRows.rows.map((row) => {
    const lastSync = row.last_sync_at ? asString(row.last_sync_at) : null;
    const sla = asNumber(row.sla_minutes) || 1440;
    const stale = row.state === "CONNECTED" ? !lastSync || now - new Date(lastSync).getTime() > sla * 60_000 : false;
    return { code: asString(row.code), name: asString(row.name), state: asString(row.state), last_sync_at: lastSync, sla_minutes: sla, stale };
  });

  return { asOf, companies, company, rows, health, counts, exceptions, heat, sources };
}
