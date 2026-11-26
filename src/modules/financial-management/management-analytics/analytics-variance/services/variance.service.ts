import "server-only";

import { asBoolean, asNumber, asNumberOrNull, asString, createItem, getItem, listItems, updateItem } from "./directus";
import { DEFAULT_POLICY, statusOf } from "./engine";
import { phtStamp, phtToday } from "../pht";
import type {
  CompanyRow,
  ExceptionListRow,
  ExceptionDetail,
  ExceptionReadingRow,
  ExceptionBoard,
  KpiRow,
  PeriodPoint,
  Policy,
  StatusCode,
  VarianceScanResult,
} from "../types";

const MONTHS = 24;
const OPEN_STATUSES = ["OPEN", "MONITORING", "ESCALATED", "RECURRENCE"];

interface SettingAll {
  setting_key: string;
  value: string;
}

function loadPolicy(settings: SettingAll[]): Policy {
  const value = (key: string, fallback: number | boolean) => {
    const row = settings.find((s) => s.setting_key === key);
    if (!row) return fallback;
    // Switches are stored as `on` / `off`.
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

function mapCompany(row: Record<string, unknown>): CompanyRow {
  return {
    id: asNumber(row.id),
    code: asString(row.code),
    name: asString(row.name),
    kind: asString(row.kind) || "OPERATING",
    parent_code: row.parent_code ? asString(row.parent_code) : null,
    industry: row.industry ? asString(row.industry) : null,
    currency: asString(row.currency) || "PHP",
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

function mapReading(row: Record<string, unknown>): ExceptionReadingRow {
  return {
    id: asNumber(row.id),
    exception_id: asNumber(row.exception_id),
    period: asString(row.period),
    value: asNumber(row.value),
    deviation: asNumber(row.deviation),
    over_limit: asBoolean(row.over_limit),
    read_at: row.read_at ? asString(row.read_at) : null,
  };
}

function mapException(
  row: Record<string, unknown>,
  company?: CompanyRow,
  kpi?: KpiRow,
): ExceptionListRow {
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
    memo: row.memo ? asString(row.memo) : null,
    memo_by: asNumberOrNull(row.memo_by),
    escalated_level: asNumber(row.escalated_level),
    escalated_at: row.escalated_at ? asString(row.escalated_at) : null,
    closed_at: row.closed_at ? asString(row.closed_at) : null,
    close_note: row.close_note ? asString(row.close_note) : null,
    direction: asString(row.direction),
    deviation: asNumber(row.deviation),
    relative_pct: asNumber(row.relative_pct),
    identity_key: asString(row.identity_key),
    companyCode: company?.code ?? "",
    companyName: company?.name ?? "",
    kpiKey: kpi?.kpi_key ?? "",
    kpiName: kpi?.name ?? "",
    unit: kpi?.unit ?? null,
    dp: kpi?.dp ?? 1,
  };
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

function periodEndDate(period: string): string {
  const [year, month] = period.split("-").map((part) => Number(part));
  const end = new Date(Date.UTC(year, month, 0));
  return end.toISOString().slice(0, 10);
}

/** Business days exclude weekends and the maintained Philippine holiday calendar. */
function addBusinessDays(from: string, days: number, holidays: Set<string>): string {
  const cursor = new Date(`${from}T00:00:00Z`);
  let remaining = days;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const iso = cursor.toISOString().slice(0, 10);
    const weekend = cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6;
    if (!weekend && !holidays.has(iso)) remaining -= 1;
  }
  return cursor.toISOString().slice(0, 10);
}

function businessDaysBetween(from: string, to: string, holidays: Set<string>): number {
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  let count = 0;
  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const iso = cursor.toISOString().slice(0, 10);
    const weekend = cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6;
    if (!weekend && !holidays.has(iso)) count += 1;
  }
  return count;
}

async function loadHolidays(): Promise<Set<string>> {
  const rows = await listItems<Record<string, unknown>>("ma_holiday", {
    fields: ["holiday_date"],
    limit: 400,
  });
  return new Set(rows.rows.map((row) => asString(row.holiday_date).slice(0, 10)));
}

async function loadBase(): Promise<{ companies: CompanyRow[]; kpis: KpiRow[]; policy: Policy }> {
  const [companyRows, kpiRows, settingRows] = await Promise.all([
    listItems<Record<string, unknown>>("ma_company", {
      fields: ["id", "code", "name", "kind", "parent_code", "industry", "currency", "fx_to_php", "revenue_weight", "headcount", "sort", "is_active"],
      sort: ["sort", "code"],
      limit: 100,
    }),
    listItems<Record<string, unknown>>("ma_kpi", {
      fields: ["id", "kpi_key", "name", "domain", "tier", "company_id", "unit", "polarity", "rule_type", "threshold", "watch_band", "dp", "rollup", "owner_position", "source_codes", "definition", "sort", "is_active"],
      filter: { is_active: { _eq: true } },
      sort: ["tier", "sort", "kpi_key"],
      limit: 400,
    }),
    listItems<Record<string, unknown>>("ma_setting", { fields: ["setting_key", "value"], limit: 50 }),
  ]);
  return {
    companies: companyRows.rows.map(mapCompany),
    kpis: kpiRows.rows.map(mapKpi),
    policy: loadPolicy(
      settingRows.rows.map((row) => ({ setting_key: asString(row.setting_key), value: asString(row.value) })),
    ),
  };
}

/** Reads the exception register with names resolved. */
export async function loadRegister(params: {
  company?: string;
  status?: string;
  q?: string;
  page?: number;
  size?: number;
}): Promise<ExceptionBoard> {
  const [{ companies, kpis, policy }, exceptionRows] = await Promise.all([
    loadBase(),
    listItems<Record<string, unknown>>("ma_exception", {
      fields: [
        "id", "company_id", "kpi_id", "period_start", "period_end", "status", "reason", "owner_user_id",
        "memo_due_date", "memo_at", "memo", "memo_by", "escalated_level", "escalated_at", "closed_at",
        "close_note", "direction", "deviation", "relative_pct", "identity_key",
      ],
      sort: ["-period_end", "-deviation"],
      limit: 800,
    }),
  ]);

  const companyById = new Map(companies.map((row) => [row.id, row]));
  const kpiById = new Map(kpis.map((row) => [row.id, row]));
  // An unknown code used to filter to nothing and read as "no exceptions", which is the same
  // answer a healthy company gives. Name the value and the codes that do exist instead.
  if (params.company && params.company !== "ALL" && !companies.some((row) => row.code === params.company)) {
    const error = new Error(
      `Unknown company "${params.company}". Known codes: ${companies.map((row) => row.code).join(", ")}.`,
    );
    error.name = "BadRequestError";
    throw error;
  }
  const today = phtToday();
  let rows = exceptionRows.rows.map((row) =>
    mapException(row, companyById.get(asNumber(row.company_id)), kpiById.get(asNumber(row.kpi_id))),
  );

  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  const overdue = rows.filter(
    (row) => OPEN_STATUSES.includes(row.status) && row.memo_due_date !== null && row.memo_due_date < today,
  ).length;

  if (params.company && params.company !== "ALL") {
    rows = rows.filter((row) => row.companyCode === params.company);
  }
  if (params.status && params.status !== "ALL") {
    rows = rows.filter((row) =>
      params.status === "OPEN_BOARD" ? OPEN_STATUSES.includes(row.status) : row.status === params.status,
    );
  }
  if (params.q) {
    const needle = params.q.trim().toLowerCase();
    rows = rows.filter((row) =>
      [row.kpiKey, row.kpiName, row.companyCode, row.companyName, row.reason ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }

  rows.sort((a, b) => {
    const rank = (status: string) => (status === "ESCALATED" ? 0 : status === "RECURRENCE" ? 1 : status === "OPEN" ? 2 : status === "MONITORING" ? 3 : 4);
    return rank(a.status) - rank(b.status) || b.period_end.localeCompare(a.period_end);
  });

  const total = rows.length;
  const size = Math.max(5, params.size ?? 10);
  const page = Math.max(1, params.page ?? 1);
  return {
    asOf: today,
    companies,
    counts,
    open: rows.filter((row) => OPEN_STATUSES.includes(row.status)).length,
    overdue,
    total,
    page,
    size,
    rows: rows.slice((page - 1) * size, (page - 1) * size + size),
    policy,
  };
}

export async function loadDetail(id: number): Promise<ExceptionDetail> {
  const [{ companies, kpis }, exception, readings] = await Promise.all([
    loadBase(),
    getItem<Record<string, unknown>>("ma_exception", id, [
      "id", "company_id", "kpi_id", "period_start", "period_end", "status", "reason", "owner_user_id",
      "memo_due_date", "memo_at", "memo", "memo_by", "escalated_level", "escalated_at", "closed_at",
      "close_note", "direction", "deviation", "relative_pct", "identity_key",
    ]),
    listItems<Record<string, unknown>>("ma_exception_reading", {
      fields: ["id", "exception_id", "period", "value", "deviation", "over_limit", "read_at"],
      filter: { exception_id: { _eq: id } },
      sort: ["period"],
      limit: 200,
    }),
  ]);

  if (!exception) throw new Error("That exception does not exist.");
  const company = companies.find((row) => row.id === asNumber(exception.company_id));
  const kpi = kpis.find((row) => row.id === asNumber(exception.kpi_id));
  return {
    exception: mapException(exception, company, kpi),
    readings: readings.rows.map(mapReading),
    kpi: kpi ?? null,
  };
}

/**
 * Scans the stored readings for a period and records an exception for every KPI that is
 * over its limit. The identity key keeps a re-scan from producing a second row for the
 * same run, which is what the specification requires.
 */
export async function scanPeriod(params: {
  period?: string;
  company?: string;
  actorId: number | null;
}): Promise<VarianceScanResult> {
  const asOf = params.period && /^\d{4}-\d{2}$/.test(params.period) ? params.period : phtToday().slice(0, 7);
  const periods = lastPeriods(asOf, MONTHS);
  const [{ companies, kpis, policy }, holidays, actualRows, targetRows, exceptionRows] = await Promise.all([
    loadBase(),
    loadHolidays(),
    listItems<Record<string, unknown>>("ma_kpi_actual", {
      fields: ["kpi_id", "period", "value"],
      filter: { period: { _in: periods } },
      limit: 6000,
    }),
    listItems<Record<string, unknown>>("ma_kpi_target", {
      fields: ["kpi_id", "period", "target"],
      filter: { period: { _in: periods } },
      limit: 6000,
    }),
    listItems<Record<string, unknown>>("ma_exception", { fields: ["id", "identity_key"], limit: 800 }),
  ]);

  const actualByKpi = new Map<number, Map<string, number>>();
  for (const row of actualRows.rows) {
    const kpiId = asNumber(row.kpi_id);
    if (!actualByKpi.has(kpiId)) actualByKpi.set(kpiId, new Map());
    actualByKpi.get(kpiId)!.set(asString(row.period), asNumber(row.value));
  }
  const targetByKpi = new Map<number, Map<string, number>>();
  for (const row of targetRows.rows) {
    const kpiId = asNumber(row.kpi_id);
    if (!targetByKpi.has(kpiId)) targetByKpi.set(kpiId, new Map());
    targetByKpi.get(kpiId)!.set(asString(row.period), asNumber(row.target));
  }
  const known = new Set(exceptionRows.rows.map((row) => asString(row.identity_key)));
  const companyById = new Map(companies.map((row) => [row.id, row]));

  const index = periods.indexOf(asOf);
  let created = 0;
  let skipped = 0;
  const touched: string[] = [];

  for (const kpi of kpis) {
    const company = companyById.get(kpi.company_id);
    if (!company) continue;
    if (params.company && params.company !== "ALL" && company.code !== params.company) continue;

    const points: PeriodPoint[] = periods.map((period) => ({
      period,
      actual: actualByKpi.get(kpi.id)?.get(period) ?? null,
      target: targetByKpi.get(kpi.id)?.get(period) ?? null,
    }));
    const status = statusOf(kpi, points, index, policy);
    if (!status.deviation || !status.run) continue;
    if (!["CONFIRMED", "PROVISIONAL", "FAVORABLE"].includes(status.code)) continue;

    const runStart = periods[status.run.start] ?? asOf;
    const identity = `${company.code}:${kpi.kpi_key}:${runStart}`;
    const actual = points[index].actual;
    if (actual === null) continue;

    const payload = {
      company_id: company.id,
      kpi_id: kpi.id,
      period_start: runStart,
      period_end: asOf,
      // `direction` is a varchar(10) holding which way the reading moved; whether that is good
      // or bad comes from the KPI's polarity plus this sign.
      direction: status.deviation.value > 0 ? "UP" : "DOWN",
      deviation: status.deviation.value,
      relative_pct: kpi.rule_type === "PCT" ? status.deviation.value : 0,
      reason: status.run.reason || status.label,
      identity_key: identity,
      status: status.code === "FAVORABLE" ? "OPEN" : status.code === "PROVISIONAL" ? "OPEN" : "OPEN",
      memo_due_date: addBusinessDays(periodEndDate(asOf), policy.memoDeadlineDays, holidays),
    };

    if (known.has(identity)) {
      skipped += 1;
      continue;
    }

    const created_row = await createItem<Record<string, unknown>>("ma_exception", {
      ...payload,
      created_at: phtStamp(),
      created_by: params.actorId,
      updated_at: phtStamp(),
      updated_by: params.actorId,
    });
    const exceptionId = asNumber(created_row.id);
    await createItem("ma_exception_reading", {
      exception_id: exceptionId,
      period: asOf,
      value: actual,
      deviation: status.deviation.value,
      over_limit: status.deviation.over,
      read_at: phtStamp(),
      created_at: phtStamp(),
      created_by: params.actorId,
      updated_at: phtStamp(),
      updated_by: params.actorId,
    });
    known.add(identity);
    created += 1;
    touched.push(`${company.code} ${kpi.kpi_key} ${status.label}`);
  }

  return { period: asOf, scanned: kpis.length, created, skipped, touched };
}

export async function fileMemo(id: number, memo: string, actorId: number | null): Promise<ExceptionDetail> {
  await updateItem("ma_exception", id, {
    memo,
    memo_by: actorId,
    memo_at: phtStamp(),
    status: "MONITORING",
    updated_at: phtStamp(),
    updated_by: actorId,
  });
  return loadDetail(id);
}

/** Closing needs the configured number of consecutive in-tolerance readings. */
export async function closeException(
  id: number,
  note: string | null,
  actorId: number | null,
): Promise<{ detail: ExceptionDetail; needed: number; have: number }> {
  const { exception, readings, kpi } = await loadDetail(id);
  const { policy } = await loadBase();
  const targets = await listItems<Record<string, unknown>>("ma_kpi_target", {
    fields: ["period", "target"],
    filter: { kpi_id: { _eq: exception.kpi_id } },
    limit: 400,
  });
  const targetByPeriod = new Map<string, number>();
  for (const row of targets.rows) targetByPeriod.set(asString(row.period), asNumber(row.target));
  const knownPeriods = [...targetByPeriod.keys()].sort();
  // A month past the newest target is judged against that newest target, the same way a
  // reading is recorded: otherwise a later month could never count toward closing.
  const targetFor = (period: string): number | null => {
    if (targetByPeriod.has(period)) return targetByPeriod.get(period) ?? null;
    const earlier = knownPeriods.filter((known) => known <= period);
    return earlier.length ? targetByPeriod.get(earlier[earlier.length - 1]) ?? null : null;
  };
  const ordered = [...readings].sort((a, b) => a.period.localeCompare(b.period));
  let consecutive = 0;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    const target = targetFor(ordered[i].period);
    // Re-judge at close time: a stored flag cannot be trusted when the reading was
    // recorded before its target existed.
    const judged = kpi
      ? statusOf(kpi, [{ period: ordered[i].period, actual: ordered[i].value, target }], 0, policy)
      : null;
    if (!judged || judged.code === "NO_DATA" || judged.deviation?.over !== false) break;
    consecutive += 1;
  }
  if (consecutive < policy.toleranceReadings) {
    return { detail: await loadDetail(id), needed: policy.toleranceReadings, have: consecutive };
  }
  await updateItem("ma_exception", id, {
    status: "CLOSED",
    closed_at: phtStamp(),
    close_note: note,
    updated_at: phtStamp(),
    updated_by: actorId,
  });
  return { detail: await loadDetail(id), needed: policy.toleranceReadings, have: consecutive };
}

export async function recordReading(
  id: number,
  params: { period?: string; value: number },
  actorId: number | null,
): Promise<ExceptionDetail> {
  const { exception, kpi } = await loadDetail(id);
  const period = params.period && /^\d{4}-\d{2}$/.test(params.period) ? params.period : phtToday().slice(0, 7);
  const targetRows = await listItems<Record<string, unknown>>("ma_kpi_target", {
    fields: ["target"],
    filter: { kpi_id: { _eq: exception.kpi_id }, period: { _eq: period } },
    limit: 1,
  });
  // A month with no target of its own is judged against the newest target before it,
  // because a reading with no yardstick cannot decide anything. The period column is a
  // string, so the comparison happens here: Directus refuses _lte on string fields.
  let target = targetRows.rows.length ? asNumber(targetRows.rows[0].target) : null;
  if (target === null) {
    const history = await listItems<Record<string, unknown>>("ma_kpi_target", {
      fields: ["period", "target"],
      filter: { kpi_id: { _eq: exception.kpi_id } },
      limit: 400,
    });
    const earlier = history.rows
      .filter((row) => asString(row.period) <= period)
      .sort((a, b) => asString(a.period).localeCompare(asString(b.period)));
    if (earlier.length) target = asNumber(earlier[earlier.length - 1].target);
  }
  const status = kpi
    ? statusOf(kpi, [{ period, actual: params.value, target }], 0, (await loadBase()).policy)
    : null;
  await createItem("ma_exception_reading", {
    exception_id: id,
    period,
    value: params.value,
    deviation: status?.deviation?.value ?? 0,
    over_limit: status?.deviation?.over ?? false,
    read_at: phtStamp(),
    created_at: phtStamp(),
    created_by: actorId,
    updated_at: phtStamp(),
    updated_by: actorId,
  });
  if (status && ["CONFIRMED", "FAVORABLE"].includes(status.code)) {
    await updateItem("ma_exception", id, {
      status: exception.status === "CLOSED" ? "RECURRENCE" : exception.status,
      updated_at: phtStamp(),
      updated_by: actorId,
    });
  }
  return loadDetail(id);
}

/**
 * Escalates every un-memoed exception past its deadline: level one on the first overdue
 * business day, level two once another full deadline has passed.
 */
export async function escalateSweep(
  today: string,
  actorId: number | null,
): Promise<{ level1: number; level2: number }> {
  const [{ policy }, holidays, rows] = await Promise.all([
    loadBase(),
    loadHolidays(),
    listItems<Record<string, unknown>>("ma_exception", {
      fields: ["id", "status", "memo_due_date", "escalated_level", "identity_key"],
      filter: { status: { _in: ["OPEN", "MONITORING"] } },
      limit: 800,
    }),
  ]);

  let level1 = 0;
  let level2 = 0;
  for (const row of rows.rows) {
    const due = row.memo_due_date ? asString(row.memo_due_date).slice(0, 10) : null;
    if (!due || due >= today) continue;
    const late = businessDaysBetween(due, today, holidays);
    if (late <= 0) continue;
    const nextLevel = late > policy.memoDeadlineDays ? 2 : 1;
    if (asNumber(row.escalated_level) >= nextLevel) continue;
    await updateItem("ma_exception", asNumber(row.id), {
      status: "ESCALATED",
      escalated_level: nextLevel,
      escalated_at: phtStamp(),
      updated_at: phtStamp(),
      updated_by: actorId,
    });
    if (nextLevel === 1) level1 += 1;
    else level2 += 1;
  }
  return { level1, level2 };
}

export type { Policy, StatusCode };
