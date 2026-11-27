import "server-only";

import { asBoolean, asNumber, asNumberOrNull, asString, listItems } from "./directus";
import { DEFAULT_POLICY, forecast, formatValue, ruleText, statusOf } from "./engine";
import type {
  CatalogCounts,
  CatalogDetail,
  CatalogPayload,
  CatalogRow,
  CompanyRow,
  PeriodPoint,
  Policy,
  StatusCode,
  Tier,
} from "../types";

const HISTORY = 24;
const SETTING_KEYS = ["seasonal_targets", "sustained_rule", "confirm_periods", "spike_multiple"];
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

async function resolveMen2Name(): Promise<string> {
  try {
    const res = await listItems<Json>("company_list", {
      fields: ["company_name"],
      filter: { company_code: { _eq: "MEN2" }, status: { _eq: "ACTIVE" } },
      limit: 1,
    });
    const name = res.rows[0] ? asString(res.rows[0].company_name) : "";
    return name || "MEN2";
  } catch {
    return "MEN2";
  }
}

type Json = Record<string, unknown>;

export interface CatalogQuery {
  tier?: string;
  company?: string;
  domain?: string;
  q?: string;
  page?: number;
  size?: number;
}

function mapCompany(row: Json): CompanyRow {
  return {
    id: asNumber(row.id),
    code: asString(row.code),
    name: asString(row.name),
    kind: asString(row.kind),
    parent_code: row.parent_code === null ? null : asString(row.parent_code),
    industry: row.industry === null ? null : asString(row.industry),
    revenue_weight: asNumberOrNull(row.revenue_weight),
    currency: asString(row.currency) || "PHP",
    fx_to_php: asNumber(row.fx_to_php, 1) || 1,
    headcount: asNumber(row.headcount),
    sort: asNumber(row.sort),
    is_active: asBoolean(row.is_active),
  };
}

async function loadPolicy(): Promise<Policy> {
  const rows = await listItems<Json>("ma_setting", {
    fields: ["setting_key", "value"],
    filter: { setting_key: { _in: SETTING_KEYS } },
    limit: 50,
  });
  const found = new Map(rows.rows.map((row) => [asString(row.setting_key), asString(row.value)]));
  const flag = (key: string, fallback: boolean) => {
    const raw = found.get(key);
    if (raw === undefined) return fallback;
    return ["on", "true", "1", "yes"].includes(raw.toLowerCase());
  };
  const number = (key: string, fallback: number) => {
    const raw = found.get(key);
    const parsed = raw === undefined ? null : Number(raw);
    return parsed === null || Number.isNaN(parsed) ? fallback : parsed;
  };
  return {
    ...DEFAULT_POLICY,
    seasonalTargets: flag("seasonal_targets", DEFAULT_POLICY.seasonalTargets),
    sustainedRule: flag("sustained_rule", DEFAULT_POLICY.sustainedRule),
    confirmPeriods: Math.max(1, number("confirm_periods", DEFAULT_POLICY.confirmPeriods)),
    spikeMultiple: Math.max(1, number("spike_multiple", DEFAULT_POLICY.spikeMultiple)),
  };
}

/** One row per KPI, judged on its newest recorded month. */
async function buildRows(kpis: Json[], companies: Map<number, CompanyRow>, policy: Policy): Promise<CatalogRow[]> {
  if (kpis.length === 0) return [];

  const kpiIds = kpis.map((row) => asNumber(row.id));
  const [actuals, targets] = await Promise.all([
    listItems<Json>("ma_kpi_actual", {
      fields: ["kpi_id", "period", "value"],
      filter: { kpi_id: { _in: kpiIds }, source_code: { _eq: "ERP" } },
      sort: ["kpi_id", "period"],
      limit: 20000,
    }),
    listItems<Json>("ma_kpi_target", {
      fields: ["kpi_id", "period", "target"],
      filter: { kpi_id: { _in: kpiIds } },
      sort: ["kpi_id", "period"],
      limit: 20000,
    }),
  ]);

  const periods = new Map<number, Map<string, PeriodPoint>>();
  const touch = (kpiId: number, period: string) => {
    const bucket = periods.get(kpiId) ?? new Map<string, PeriodPoint>();
    periods.set(kpiId, bucket);
    const point = bucket.get(period) ?? { period, actual: null, target: null };
    bucket.set(period, point);
    return point;
  };
  for (const row of actuals.rows) {
    const point = touch(asNumber(row.kpi_id), asString(row.period));
    point.actual = asNumberOrNull(row.value);
  }
  for (const row of targets.rows) {
    const point = touch(asNumber(row.kpi_id), asString(row.period));
    point.target = asNumberOrNull(row.target);
  }

  return kpis.map((raw) => {
    const kpi = mapKpi(raw);
    const points = Array.from(periods.get(kpi.id)?.values() ?? [])
      .sort((a, b) => a.period.localeCompare(b.period))
      .slice(-HISTORY);
    const index = lastRecorded(points);
    const status = statusOf(kpi, points, index, policy);
    const point = index >= 0 ? points[index] : null;
    const before = index > 0 ? points[index - 1] : null;
    const company = companies.get(kpi.company_id);
    return {
      kpi,
      companyCode: company?.code ?? "unassigned",
      companyName: company?.name ?? "Unknown company",
      period: point?.period ?? null,
      actual: point?.actual ?? null,
      actualText: point?.actual === null || point?.actual === undefined ? "—" : formatValue(point.actual, kpi),
      targetText: point?.target === null || point?.target === undefined ? "—" : formatValue(point.target, kpi),
      rule: ruleText(kpi),
      statusCode: status.code,
      statusLabel: status.label,
      change:
        point?.actual !== null && point?.actual !== undefined && before?.actual !== null && before?.actual !== undefined
          ? point.actual - before.actual
          : null,
      memoRequired: status.memoRequired,
    } satisfies CatalogRow;
  });
}

function mapKpi(row: Json): CatalogRow["kpi"] {
  return {
    id: asNumber(row.id),
    kpi_key: asString(row.kpi_key),
    name: asString(row.name),
    domain: asString(row.domain),
    tier: asString(row.tier) as Tier,
    company_id: asNumber(row.company_id),
    unit: row.unit === null ? null : asString(row.unit),
    polarity: asString(row.polarity) === "HIGH" ? "HIGH" : "LOW",
    rule_type: (asString(row.rule_type) || "PCT") as CatalogRow["kpi"]["rule_type"],
    threshold: asNumberOrNull(row.threshold),
    watch_band: asNumberOrNull(row.watch_band),
    dp: asNumber(row.dp, 1),
    rollup: (asString(row.rollup) || "COMPANY") as CatalogRow["kpi"]["rollup"],
    owner_position: row.owner_position === null ? null : asString(row.owner_position),
    source_codes: row.source_codes === null ? null : asString(row.source_codes),
    definition: row.definition === null ? null : asString(row.definition),
    sort: asNumber(row.sort),
    is_active: asBoolean(row.is_active),
  };
}

function lastRecorded(points: PeriodPoint[]): number {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (points[index].actual !== null) return index;
  }
  return -1;
}

const TIER_ORDER: Tier[] = ["CORE", "WORKFORCE", "INDUSTRY", "HOLDINGS"];

export async function loadCatalog(query: CatalogQuery): Promise<CatalogPayload> {
  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const size = Math.min(100, Math.max(5, Math.trunc(query.size ?? 20)));

  const [companyRows, kpiRows, policy, men2Name] = await Promise.all([
    listItems<Json>("ma_company", { fields: ["*"], sort: "sort", limit: 50 }),
    listItems<Json>("ma_kpi", {
      fields: ["*"],
      filter: { is_active: { _eq: true } },
      sort: ["tier", "company_id", "sort"],
      limit: 400,
    }),
    loadPolicy(),
    resolveMen2Name(),
  ]);

  const mappedCompanies = companyRows.rows
    .map((row) => mapCompany(row))
    .filter((company) => company.is_active && company.code === "dist")
    .map((company) => ({ ...company, name: men2Name, industry: "Distribution" }));
  const companies = new Map(mappedCompanies.map((company) => [company.id, company]));
  const liveKpiRows = kpiRows.rows.filter(
    (row) => ERP_LIVE_KEYS.has(asString(row.kpi_key)) && (companies.size === 0 || companies.has(asNumber(row.company_id))),
  );
  const rows = await buildRows(liveKpiRows, companies, policy);

  const counts: CatalogCounts = { CORE: 0, WORKFORCE: 0, INDUSTRY: 0, HOLDINGS: 0 };
  for (const row of rows) counts[row.kpi.tier] += 1;

  const domains = Array.from(new Set(rows.map((row) => row.kpi.domain))).sort();
  const needle = (query.q ?? "").trim().toLowerCase();
  // The stored values are written by the seed in mixed case ("Manufacturing"), so every
  // filter compares uppercase to uppercase; a strict compare emptied the catalogue.
  const same = (stored: string, wanted: string) => stored.toUpperCase() === wanted;
  const tier = (query.tier ?? "ALL").toUpperCase();
  const domain = (query.domain ?? "ALL").toUpperCase();
  const companyCode = (query.company ?? "ALL").toUpperCase();

  const filtered = rows
    .filter((row) => (tier === "ALL" ? true : same(row.kpi.tier, tier)))
    .filter((row) => (domain === "ALL" ? true : same(row.kpi.domain, domain)))
    .filter((row) => (companyCode === "ALL" ? true : row.companyCode.toUpperCase() === companyCode))
    .filter((row) =>
      needle.length === 0
        ? true
        : `${row.kpi.name} ${row.kpi.kpi_key} ${row.kpi.definition ?? ""} ${row.kpi.owner_position ?? ""}`
            .toLowerCase()
            .includes(needle),
    )
    .sort(
      (a, b) =>
        TIER_ORDER.indexOf(a.kpi.tier) - TIER_ORDER.indexOf(b.kpi.tier) ||
        a.companyCode.localeCompare(b.companyCode) ||
        a.kpi.sort - b.kpi.sort ||
        a.kpi.name.localeCompare(b.kpi.name),
    );

  const start = (page - 1) * size;
  const period = rows
    .map((row) => row.period)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  const scopedWithoutTier = rows
    .filter((row) => (domain === "ALL" ? true : same(row.kpi.domain, domain)))
    .filter((row) => (companyCode === "ALL" ? true : row.companyCode.toUpperCase() === companyCode))
    .filter((row) =>
      needle.length === 0
        ? true
        : `${row.kpi.name} ${row.kpi.kpi_key} ${row.kpi.definition ?? ""} ${row.kpi.owner_position ?? ""}`
            .toLowerCase()
            .includes(needle),
    )
    .sort(
      (a, b) =>
        TIER_ORDER.indexOf(a.kpi.tier) - TIER_ORDER.indexOf(b.kpi.tier) ||
        a.companyCode.localeCompare(b.companyCode) ||
        a.kpi.sort - b.kpi.sort ||
        a.kpi.name.localeCompare(b.kpi.name),
    );

  return {
    rows: filtered.slice(start, start + size),
    allOptions: scopedWithoutTier.map((row) => ({
      id: row.kpi.id,
      kpiKey: row.kpi.kpi_key,
      name: row.kpi.name,
      companyCode: row.companyCode,
      companyName: row.companyName,
    })),
    total: filtered.length,
    counts,
    companies: mappedCompanies.map((company) => ({ id: company.id, code: company.code, name: company.name })),
    domains,
    period,
    page,
    size,
  };
}

export async function loadCatalogDetail(kpiId: number): Promise<CatalogDetail | null> {
  const raw = await listItems<Json>("ma_kpi", { fields: ["*"], filter: { id: { _eq: kpiId } }, limit: 1 });
  if (raw.rows.length === 0) return null;

  const [companyRows, men2Name, policy] = await Promise.all([
    listItems<Json>("ma_company", { fields: ["*"], sort: "sort", limit: 50 }),
    resolveMen2Name(),
    loadPolicy(),
  ]);
  const mappedCompanies = companyRows.rows
    .map((row) => mapCompany(row))
    .filter((company) => company.code === "dist")
    .map((company) => ({ ...company, name: men2Name, industry: "Distribution" }));
  const companies = new Map(mappedCompanies.map((company) => [company.id, company]));
  const [row] = await buildRows(raw.rows, companies, policy);
  if (!row) return null;

  const [actuals, targets] = await Promise.all([
    listItems<Json>("ma_kpi_actual", {
      fields: ["period", "value"],
      filter: { kpi_id: { _eq: kpiId }, source_code: { _eq: "ERP" } },
      sort: "period",
      limit: HISTORY,
    }),
    listItems<Json>("ma_kpi_target", {
      fields: ["period", "target"],
      filter: { kpi_id: { _eq: kpiId } },
      sort: "period",
      limit: HISTORY,
    }),
  ]);

  const buckets = new Map<string, PeriodPoint>();
  for (const item of actuals.rows) {
    buckets.set(asString(item.period), { period: asString(item.period), actual: asNumberOrNull(item.value), target: null });
  }
  for (const item of targets.rows) {
    const period = asString(item.period);
    const point = buckets.get(period) ?? { period, actual: null, target: null };
    point.target = asNumberOrNull(item.target);
    buckets.set(period, point);
  }

  const points = Array.from(buckets.values()).sort((a, b) => a.period.localeCompare(b.period));
  const index = lastRecorded(points);
  const status = statusOf(row.kpi, points, index, policy);

  return {
    row: { ...row, statusCode: status.code, statusLabel: status.label },
    points,
    status,
    forecast: index >= 0 ? forecast(points, row.kpi, 3) : null,
  };
}

export function statusTone(code: StatusCode): "success" | "warning" | "danger" | "info" | "neutral" {
  if (code === "ON_TRACK" || code === "FAVORABLE") return "success";
  if (code === "WATCH") return "warning";
  if (code === "PROVISIONAL") return "info";
  if (code === "CONFIRMED") return "danger";
  return "neutral";
}
