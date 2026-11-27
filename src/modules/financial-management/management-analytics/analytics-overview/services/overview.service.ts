import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth-utils";
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
const DEFAULT_ERP_BASE = "http://goatedcodoer:8076";
const ERP_LIVE_KEYS = new Set([
  "dist.opex",
  "dist.ncr",
  "dist.capa",
  "dist.abs",
  "dist.tardy",
  "dist.ot",
  "dist.fill",
  "dist.otif",
  "dist.pick",
  "dist.freight",
]);

interface LiveErpReading {
  kpiKey: string;
  period: string;
  value: number | null;
  basis?: string;
}

interface ActiveCompanyInfo {
  code: string;
  name: string;
  springboot: string;
}

async function loadActiveCompaniesFromDirectory(): Promise<ActiveCompanyInfo[]> {
  const fallbackBase = (process.env.SPRING_API_BASE_URL || DEFAULT_ERP_BASE).trim().replace(/\/+$/, "");
  try {
    const res = await listItems<Record<string, unknown>>("company_list", {
      fields: ["company_code", "company_name", "springboot"],
      filter: { status: { _eq: "ACTIVE" } },
      sort: ["company_code"],
      limit: 50,
    });
    const list = res.rows
      .map((row) => ({
        code: asString(row.company_code).trim(),
        name: asString(row.company_name).trim() || asString(row.company_code).trim(),
        springboot: asString(row.springboot).trim().replace(/\/+$/, ""),
      }))
      .filter((row) => row.code.length > 0);
    if (list.length > 0) return list;
  } catch {
    // Fallback below if company_list cannot be read
  }
  return [{ code: "MEN2", name: "MEN2", springboot: fallbackBase }];
}

async function fetchLiveErpReadings(period: string, springboot: string): Promise<LiveErpReading[] | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    const res = await fetch(`${springboot}/api/management-analytics/kpi-readings?period=${encodeURIComponent(period)}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as {
      success?: boolean;
      data?: { readings?: LiveErpReading[] };
    } | null;
    return body?.success ? (body.data?.readings ?? []) : null;
  } catch {
    return null;
  }
}

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

  const [companyRows, kpiRows, settingRows, sourceRows, exceptionRows, activeDirectory] = await Promise.all([
    listItems<Record<string, unknown>>("ma_company", { fields: ["id", "code", "name", "kind", "parent_code", "industry", "currency", "fx_to_php", "revenue_weight", "headcount", "sort", "is_active"], sort: ["sort", "code"], limit: 100 }),
    listItems<Record<string, unknown>>("ma_kpi", { fields: ["id", "kpi_key", "name", "domain", "tier", "company_id", "unit", "polarity", "rule_type", "threshold", "watch_band", "dp", "rollup", "owner_position", "source_codes", "definition", "sort", "is_active"], filter: { is_active: { _eq: true } }, sort: ["tier", "sort", "kpi_key"], limit: 400 }),
    listItems<Record<string, unknown>>("ma_setting", { fields: ["setting_key", "value"], limit: 100 }),
    listItems<Record<string, unknown>>("ma_source", { fields: ["code", "name", "state", "last_sync_at", "sla_minutes"], sort: "code", limit: 100 }),
    listItems<Record<string, unknown>>("ma_exception", { fields: ["id", "company_id", "kpi_id", "period_start", "period_end", "status", "reason", "owner_user_id", "memo_due_date", "memo_at", "escalated_level", "direction", "deviation", "relative_pct", "memo"], filter: { status: { _in: ["OPEN", "MONITORING", "ESCALATED", "RECURRENCE"] } }, sort: ["-period_start"], limit: 200 }),
    loadActiveCompaniesFromDirectory(),
  ]);

  const maCompanies = companyRows.rows.map(mapCompany);
  const distTemplate = maCompanies.find((row) => row.code === "dist") ?? maCompanies[0];

  // Build real company list directly from Directus `company_list` (no invented mock entities).
  const companies: CompanyRow[] = activeDirectory.map((dir, idx) => {
    const isMen2 = dir.code.toUpperCase() === "MEN2";
    const matchedMa =
      maCompanies.find((c) => c.code.toUpperCase() === dir.code.toUpperCase()) ??
      (isMen2 ? distTemplate : undefined);
    return {
      id: matchedMa?.id ?? 1000 + idx,
      code: dir.code,
      name: dir.name,
      kind: "OPERATING",
      parent_code: null,
      industry: isMen2 ? "Distribution" : (matchedMa?.industry ?? "Operating Entity"),
      currency: matchedMa?.currency ?? "PHP",
      fx_to_php: matchedMa?.fx_to_php ?? 1,
      revenue_weight: matchedMa?.revenue_weight ?? null,
      headcount: matchedMa?.headcount ?? 0,
      sort: isMen2 ? 0 : idx + 1,
      is_active: true,
    };
  });

  const requestedCode = (params.company ?? "").trim().toUpperCase();
  const isGroupView = !requestedCode || requestedCode === "ALL";
  const selectedCompany = isGroupView
    ? null
    : (companies.find((c) => c.code.toUpperCase() === requestedCode) ??
      companies.find((c) => c.code.toUpperCase() === "MEN2") ??
      companies[0] ??
      null);

  const men2Dir =
    activeDirectory.find((d) => d.code.toUpperCase() === "MEN2") ??
    activeDirectory[0];
  const selectedDir = isGroupView
    ? men2Dir
    : (activeDirectory.find((d) => d.code.toUpperCase() === (selectedCompany?.code.toUpperCase() ?? "")) ??
      men2Dir);
  const isMen2Scope = isGroupView || (selectedCompany?.code.toUpperCase() ?? "") === "MEN2";

  const company = selectedCompany;
  const kpis = isMen2Scope
    ? kpiRows.rows
        .map(mapKpi)
        .filter((kpi) => ERP_LIVE_KEYS.has(kpi.kpi_key) && (!distTemplate || kpi.company_id === distTemplate.id))
    : kpiRows.rows
        .map(mapKpi)
        .filter((kpi) => company && kpi.company_id === company.id && ERP_LIVE_KEYS.has(kpi.kpi_key));
  const liveKpiIds = kpis.map((k) => k.id);
  const policy = loadPolicy(settingRows.rows.map((row) => ({ setting_key: asString(row.setting_key), value: asString(row.value) })));

  const [targetRows, actualRows, liveErpReadings] = await Promise.all([
    liveKpiIds.length > 0
      ? listItems<Record<string, unknown>>("ma_kpi_target", {
          fields: ["kpi_id", "period", "target"],
          filter: { period: { _in: periods }, kpi_id: { _in: liveKpiIds } },
          limit: 6000,
        })
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    liveKpiIds.length > 0
      ? listItems<Record<string, unknown>>("ma_kpi_actual", {
          fields: ["kpi_id", "period", "value", "basis"],
          filter: { period: { _in: periods }, source_code: { _eq: "ERP" }, kpi_id: { _in: liveKpiIds } },
          limit: 6000,
        })
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
    selectedDir?.springboot ? fetchLiveErpReadings(asOf, selectedDir.springboot) : Promise.resolve(null),
  ]);

  const targets = new Map<string, number>();
  for (const row of targetRows.rows) targets.set(`${asNumber(row.kpi_id)}|${asString(row.period)}`, asNumber(row.target));
  const actuals = new Map<string, { value: number; basis: string }>();
  for (const row of actualRows.rows) {
    actuals.set(`${asNumber(row.kpi_id)}|${asString(row.period)}`, {
      value: asNumber(row.value),
      basis: asString(row.basis) || "ACTUAL",
    });
  }

  // Overlay live ERP API readings for `asOf` so the screen always matches ERP_SERVER directly
  if (liveErpReadings) {
    const kpiByKey = new Map(kpis.map((k) => [k.kpi_key, k]));
    for (const reading of liveErpReadings) {
      const kpi = kpiByKey.get(reading.kpiKey);
      if (!kpi) continue;
      const cellKey = `${kpi.id}|${asOf}`;
      if (typeof reading.value === "number" && Number.isFinite(reading.value)) {
        actuals.set(cellKey, { value: reading.value, basis: reading.basis || "ACTUAL" });
      } else {
        actuals.delete(cellKey);
      }
    }
  }

  const seriesFor = (kpi: KpiRow): PeriodPoint[] =>
    periods.map((period) => ({
      period,
      target: targets.get(`${kpi.id}|${period}`) ?? null,
      actual: actuals.get(`${kpi.id}|${period}`)?.value ?? null,
    }));

  const indexOfPeriod = (points: PeriodPoint[]): number => {
    const exact = points.findIndex((p) => p.period === asOf);
    if (exact >= 0) return exact;
    for (let i = points.length - 1; i >= 0; i -= 1) if (points[i].actual !== null) return i;
    return points.length - 1;
  };

  const statusFor = (kpi: KpiRow): { status: KpiStatus; points: PeriodPoint[]; index: number } => {
    const points = seriesFor(kpi);
    const index = indexOfPeriod(points);
    return { status: statusOf(kpi, points, index, policy), points, index };
  };

  const rows: OverviewRow[] = kpis
    .map((kpi) => {
      const { status, points, index } = statusFor(kpi);
      const point = points[index];
      const latestTarget = point?.target ?? points.reduce<number | null>((found, p) => (p.target !== null ? p.target : found), null);
      return {
        kpi,
        status,
        actual: point?.actual ?? null,
        target: latestTarget,
        period: point?.period ?? asOf,
        stale: point ? point.actual !== null && point.period < periods[periods.length - 1] : false,
        missingActual: point?.actual === null || point?.actual === undefined,
        missingTarget: latestTarget === null || latestTarget === undefined,
        points,
      };
    })
    .sort((a, b) => a.kpi.sort - b.kpi.sort || a.kpi.kpi_key.localeCompare(b.kpi.kpi_key));

  const counts: Record<StatusCode, number> = { ON_TRACK: 0, WATCH: 0, PROVISIONAL: 0, CONFIRMED: 0, FAVORABLE: 0, NO_DATA: 0 };
  for (const row of rows) counts[row.status.code] += 1;
  const health = healthScore(rows.map((row) => row.status));

  const kpiById = new Map(kpis.map((kpi) => [kpi.id, kpi]));
  const exceptions = exceptionRows.rows
    .map(mapException)
    .filter((row) => kpiById.has(row.kpi_id) && (!company || row.company_id === company.id))
    .map((mapped) => {
      const kpi = kpiById.get(mapped.kpi_id);
      return {
        ...mapped,
        kpiName: kpi?.name ?? `KPI ${mapped.kpi_id}`,
        companyName: company?.name ?? selectedDir?.name ?? "MEN2",
      };
    });

  const companyScorecard = company
    ? [
        {
          id: company.id,
          code: company.code,
          name: company.name,
          industry: "Distribution",
          revenueWeight: company.revenue_weight,
          health,
          onTrack: counts.ON_TRACK + counts.FAVORABLE,
          watch: counts.WATCH + counts.PROVISIONAL,
          breach: counts.CONFIRMED,
          escalated: exceptions.filter((ex) => ex.status === "ESCALATED").length,
          topIssue: null,
        },
      ]
    : [];

  const now = Date.now();
  const sources = sourceRows.rows
    .filter((row) => asString(row.code).toUpperCase() === "ERP")
    .map((row) => {
      const lastSync = row.last_sync_at ? asString(row.last_sync_at) : null;
      const sla = asNumber(row.sla_minutes) || 1440;
      const stale = row.state === "CONNECTED" ? !lastSync || now - new Date(lastSync).getTime() > sla * 60_000 : false;
      return { code: asString(row.code), name: asString(row.name), state: asString(row.state), last_sync_at: lastSync, sla_minutes: sla, stale };
    });

  return {
    asOf,
    companies,
    company,
    rows,
    health,
    counts,
    exceptions,
    companyScorecard,
    heat: [],
    sources,
    bridge: null,
  };
}
