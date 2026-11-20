import "server-only";

import { asNumber, asNumberOrNull, asString, listItems } from "./directus";
import { DEFAULT_POLICY, healthScore, statusOf } from "./engine";
import type { CadencePayload, CadenceRow, KpiRow, PeriodPoint, Policy, RhythmRow, Rollup } from "../types";

type Json = Record<string, unknown>;

const KPI_FIELDS = [
  "id",
  "kpi_key",
  "name",
  "company_id",
  "tier",
  "domain",
  "unit",
  "polarity",
  "rule_type",
  "threshold",
  "watch_band",
  "dp",
  "rollup",
  "owner_position",
  "source_codes",
  "definition",
  "is_active",
  "sort",
];

function mapKpi(row: Json): KpiRow {
  return {
    id: asNumber(row.id),
    kpi_key: asString(row.kpi_key),
    name: asString(row.name),
    company_id: asNumber(row.company_id),
    tier: asString(row.tier) as KpiRow["tier"],
    domain: asString(row.domain),
    unit: asString(row.unit) || null,
    polarity: asString(row.polarity) as KpiRow["polarity"],
    rule_type: asString(row.rule_type) as KpiRow["rule_type"],
    threshold: asNumberOrNull(row.threshold),
    watch_band: asNumberOrNull(row.watch_band),
    dp: asNumber(row.dp),
    rollup: asString(row.rollup) as Rollup,
    owner_position: asString(row.owner_position) || null,
    source_codes: asString(row.source_codes) || null,
    definition: asString(row.definition) || null,
    is_active: row.is_active === true || row.is_active === 1 || row.is_active === "1",
    sort: asNumber(row.sort),
  };
}

async function loadPolicy(): Promise<Policy> {
  const rows = await listItems<Json>("ma_setting", { fields: ["setting_key", "value"], limit: 200 });
  const map = new Map<string, string>();
  for (const row of rows.rows) map.set(asString(row.setting_key), asString(row.value));
  const flag = (key: string, fallback: boolean) => {
    const raw = (map.get(key) ?? "").toLowerCase();
    if (!raw) return fallback;
    return ["on", "true", "1", "yes"].includes(raw);
  };
  const number = (key: string, fallback: number) => {
    const raw = Number(map.get(key));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  };
  return {
    seasonalTargets: flag("seasonal_targets", DEFAULT_POLICY.seasonalTargets),
    sustainedRule: flag("sustained_rule", DEFAULT_POLICY.sustainedRule),
    confirmPeriods: number("confirm_periods", DEFAULT_POLICY.confirmPeriods),
    spikeMultiple: number("spike_multiple", DEFAULT_POLICY.spikeMultiple),
    memoDeadlineDays: number("memo_deadline_days", DEFAULT_POLICY.memoDeadlineDays),
    toleranceReadings: number("tolerance_readings", DEFAULT_POLICY.toleranceReadings),
  };
}

export async function loadCadence(requested?: string): Promise<CadencePayload> {
  const [companyRows, kpiRows, readingRows, targetRows, exceptionRows, sourceRows, policy] =
    await Promise.all([
      listItems<Json>("ma_company", { fields: ["id", "code", "name", "kind"], sort: "sort", limit: 50 }),
      listItems<Json>("ma_kpi", { fields: KPI_FIELDS, limit: 2000 }),
      listItems<Json>("ma_kpi_actual", { fields: ["kpi_id", "period", "value"], sort: "period", limit: 20000 }),
      listItems<Json>("ma_kpi_target", { fields: ["kpi_id", "period", "target"], limit: 20000 }),
      listItems<Json>("ma_exception", {
        fields: ["company_id", "status", "memo_due_date"],
        limit: 2000,
      }),
      listItems<Json>("ma_source", {
        fields: ["code", "name", "cadence", "steward", "state", "last_sync_at", "sla_minutes"],
        sort: "code",
        limit: 50,
      }),
      loadPolicy(),
    ]);

  const kpis = kpiRows.rows.map(mapKpi).filter((row) => row.is_active);

  const targets = new Map<string, number>();
  for (const row of targetRows.rows) {
    targets.set(`${asNumber(row.kpi_id)}|${asString(row.period)}`, asNumber(row.target));
  }

  const periods = [...new Set(readingRows.rows.map((row) => asString(row.period)))].sort();
  const period = requested && periods.includes(requested) ? requested : (periods.at(-1) ?? "");

  const series = new Map<number, PeriodPoint[]>();
  for (const row of readingRows.rows) {
    const kpiId = asNumber(row.kpi_id);
    const month = asString(row.period);
    const list = series.get(kpiId) ?? [];
    list.push({
      period: month,
      actual: asNumber(row.value),
      target: targets.get(`${kpiId}|${month}`) ?? null,
    });
    series.set(kpiId, list);
  }
  for (const list of series.values()) list.sort((a, b) => a.period.localeCompare(b.period));

  const codes = new Map<number, { code: string; name: string; kind: string }>();
  for (const row of companyRows.rows) {
    codes.set(asNumber(row.id), {
      code: asString(row.code),
      name: asString(row.name),
      kind: asString(row.kind),
    });
  }

  const openExceptions = new Map<number, number>();
  const overdueMemos = new Map<number, number>();
  const today = new Date().toISOString().slice(0, 10);
  for (const row of exceptionRows.rows) {
    const status = asString(row.status);
    const companyId = asNumber(row.company_id);
    if (["OPEN", "MONITORING", "ESCALATED", "RECURRENCE"].includes(status)) {
      openExceptions.set(companyId, (openExceptions.get(companyId) ?? 0) + 1);
    }
    const due = asString(row.memo_due_date);
    if (due && due < today && ["OPEN", "ESCALATED"].includes(status)) {
      overdueMemos.set(companyId, (overdueMemos.get(companyId) ?? 0) + 1);
    }
  }

  const rows: CadenceRow[] = [];
  for (const [companyId, info] of codes) {
    if (info.kind === "GROUP") continue;
    const own = kpis.filter((kpi) => kpi.company_id === companyId);
    const statuses = own
      .map((kpi) => {
        const points = series.get(kpi.id) ?? [];
        const index = points.findIndex((point) => point.period === period);
        if (index < 0) return null;
        return statusOf(kpi, points, index, policy);
      })
      .filter((status): status is NonNullable<typeof status> => status !== null);

    rows.push({
      companyId,
      code: info.code,
      name: info.name,
      period: statuses.length > 0 ? period : null,
      health: statuses.length > 0 ? healthScore(statuses) : null,
      onTrack: statuses.filter((status) => status.code === "ON_TRACK").length,
      watch: statuses.filter((status) => status.code === "WATCH").length,
      provisional: statuses.filter((status) => status.code === "PROVISIONAL").length,
      breach: statuses.filter((status) => status.code === "CONFIRMED").length,
      favourable: statuses.filter((status) => status.code === "FAVORABLE").length,
      noData: own.length - statuses.length,
      exceptionsOpen: openExceptions.get(companyId) ?? 0,
      memoOverdue: overdueMemos.get(companyId) ?? 0,
    });
  }

  const expected = kpis.length;
  const readings = kpis.filter((kpi) =>
    (series.get(kpi.id) ?? []).some((point) => point.period === period),
  ).length;

  const sources = sourceRows.rows.map((row) => {
    const lastSync = asString(row.last_sync_at) || null;
    const sla = asNumberOrNull(row.sla_minutes);
    const minutes = lastSync ? (Date.now() - new Date(`${lastSync}Z`).getTime()) / 60000 : null;
    return {
      code: asString(row.code),
      name: asString(row.name),
      cadence: asString(row.cadence),
      steward: asString(row.steward),
      state: asString(row.state),
      lastSync,
      fresh: minutes !== null && sla !== null ? minutes <= sla : false,
    };
  });

  const totalOpen = [...openExceptions.values()].reduce((sum, value) => sum + value, 0);
  const totalOverdue = [...overdueMemos.values()].reduce((sum, value) => sum + value, 0);
  const staleSources = sources.filter((source) => !source.fresh).length;

  const rhythms: RhythmRow[] = [
    {
      rhythm: "DAILY",
      label: "Daily",
      headline:
        totalOverdue > 0 ? `${totalOverdue} memo${totalOverdue === 1 ? "" : "s"} overdue` : "Nothing overdue today",
      detail:
        totalOverdue > 0
          ? "Owners confirm or file; the escalation sweep runs the next business day."
          : "No exception is past its memo deadline.",
      count: totalOverdue,
      tone: totalOverdue > 0 ? "danger" : "success",
    },
    {
      rhythm: "WEEKLY",
      label: "Weekly",
      headline: `${totalOpen} exception${totalOpen === 1 ? "" : "s"} on the board`,
      detail: "Controllers review movement before the monthly pack closes.",
      count: totalOpen,
      tone: totalOpen > 0 ? "warning" : "success",
    },
    {
      rhythm: "MONTHLY",
      label: "Monthly",
      headline: `${readings} of ${expected} measures read for ${period}`,
      detail: "Close the month, run the checks, then hold the management review.",
      count: readings,
      tone: readings >= expected ? "success" : readings > 0 ? "warning" : "danger",
    },
  ];

  const judged = rows.filter((row) => row.health !== null);
  const health =
    judged.length > 0
      ? Math.round(judged.reduce((sum, row) => sum + (row.health ?? 0), 0) / judged.length)
      : null;

  return {
    period,
    periods,
    rows,
    rhythms,
    totals: {
      health,
      exceptionsOpen: totalOpen,
      memoOverdue: totalOverdue,
      readings,
      expected,
      staleSources,
    },
    sources,
    policy,
  };
}
