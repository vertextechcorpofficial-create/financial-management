import "server-only";

import { asNumber, asNumberOrNull, asString, createItem, listItems, updateItem } from "./directus";
import { phtStamp } from "../pht";
import type { CoverageRow, DataPayload, GateResult, ReadingBody, RunRow, SourceRow } from "../types";

type Json = Record<string, unknown>;

const KPI_FIELDS = [
  "id",
  "kpi_key",
  "name",
  "company_id",
  "unit",
  "dp",
  "rule_type",
  "tier",
  "domain",
  "is_active",
  "polarity",
  "threshold",
  "watch_band",
  "rollup",
  "owner_position",
  "source_codes",
  "definition",
  "sort",
];

function mapSource(row: Json, readings: number, feeds: { kpis: number; companies: number }): SourceRow {
  const lastSync = row.last_sync_at === null ? null : asString(row.last_sync_at);
  const ageMinutes = lastSync === null ? null : Math.max(0, Math.round((Date.now() - new Date(lastSync).getTime()) / 60000));
  const sla = asNumber(row.sla_minutes);
  return {
    id: asNumber(row.id),
    code: asString(row.code),
    name: asString(row.name),
    cadence: asString(row.cadence),
    sla_minutes: sla,
    steward: row.steward === null ? null : asString(row.steward),
    state: asString(row.state),
    last_sync_at: lastSync,
    ageMinutes,
    fresh: ageMinutes !== null && sla > 0 && ageMinutes <= sla,
    readings,
    feeds,
  };
}

const SOURCE_FIELDS = ["id", "code", "name", "cadence", "sla_minutes", "state", "last_sync_at", "steward"];

/** Which feeds have rows behind them, so a re-pull knows there is something to read. */
async function countReadingsBySource(): Promise<Map<string, number>> {
  const rows = await listItems<Json>("ma_kpi_actual", { fields: ["source_code"], limit: 5000 });
  const counts = new Map<string, number>();
  for (const row of rows.rows) {
    const code = asString(row.source_code);
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

function monthOf(isoDay: string): string {
  return isoDay.slice(0, 7);
}

function monthIndex(month: string): number {
  const [year, index] = month.split("-").map(Number);
  return year * 12 + (index - 1);
}

/** The month next to the one asked for, so an empty board can point at a month that has rows. */
function nearestMonth(periods: string[], wanted: string): string | null {
  if (periods.length === 0) return null;
  const target = monthIndex(wanted);
  return periods.reduce((best, month) => (Math.abs(monthIndex(month) - target) < Math.abs(monthIndex(best) - target) ? month : best));
}

/** Gaps in the month: which measures have no reading, and where the data is dirty. */
async function buildCoverage(period: string, kpis: Json[], companies: Set<number>): Promise<CoverageRow> {
  const readings = await listItems<Json>("ma_kpi_actual", {
    fields: ["id", "kpi_id", "period", "basis"],
    filter: { period: { _eq: period } },
    limit: 5000,
  });

  const seen = new Map<number, number>();
  let provisional = 0;
  for (const row of readings.rows) {
    const kpiId = asNumber(row.kpi_id);
    seen.set(kpiId, (seen.get(kpiId) ?? 0) + 1);
    if (asString(row.basis).toUpperCase() === "PROVISIONAL") provisional += 1;
  }

  const duplicates = Array.from(seen.values()).filter((count) => count > 1).reduce((sum, count) => sum + (count - 1), 0);
  const active = kpis.filter((row) => row.is_active === true || row.is_active === 1);
  const missingKpis = active
    .filter((row) => !seen.has(asNumber(row.id)))
    .slice(0, 40)
    .map((row) => ({
      kpi_key: asString(row.kpi_key),
      name: asString(row.name),
      companyCode: "unassigned",
    }));

  const orphanCompanies = active.filter((row) => !companies.has(asNumber(row.company_id))).length;

  return {
    period,
    readings: readings.rows.length,
    expected: active.length,
    missing: Math.max(0, active.length - seen.size),
    provisional,
    duplicates,
    orphanCompanies,
    missingKpis,
  };
}

/** Only the gates this data can actually decide are run; the rest say why not. */
function computeGates(coverage: CoverageRow): GateResult[] {
  return [
    {
      gate: "COMPLETENESS",
      status: coverage.missing === 0 ? "PASS" : "FAIL",
      rowsOk: coverage.readings,
      rowsFailed: coverage.missing,
      detail:
        coverage.missing === 0
          ? `Every active measure has a reading for ${coverage.period}.`
          : `${coverage.missing} of ${coverage.expected} measures have no reading for ${coverage.period}.`,
    },
    {
      gate: "DUPLICATION",
      status: coverage.duplicates === 0 ? "PASS" : "FAIL",
      rowsOk: coverage.readings - coverage.duplicates,
      rowsFailed: coverage.duplicates,
      detail:
        coverage.duplicates === 0
          ? "One reading per measure and month."
          : `${coverage.duplicates} extra reading(s) for the same measure and month; the newest is used and the rest should be merged.`,
    },
    {
      gate: "REFERENTIAL",
      status: coverage.orphanCompanies === 0 ? "PASS" : "FAIL",
      rowsOk: coverage.expected - coverage.orphanCompanies,
      rowsFailed: coverage.orphanCompanies,
      detail:
        coverage.orphanCompanies === 0
          ? "Every measure points at a company that exists."
          : `${coverage.orphanCompanies} measure(s) point at a company that is not in the register.`,
    },
    {
      gate: "RECONCILIATION",
      status: "NOT_RUN",
      rowsOk: 0,
      rowsFailed: 0,
      detail:
        "Needs the ERP source mapped to measures. Until then a reading cannot be tied back to a ledger figure, so nothing is claimed about it.",
    },
    {
      gate: "INTERCOMPANY",
      status: "NOT_RUN",
      rowsOk: 0,
      rowsFailed: 0,
      detail: "Intercompany matching needs the counterparty columns mapped on both sides of the pair.",
    },
  ];
}

export async function loadData(requested?: string): Promise<DataPayload> {
  const [sourceRows, kpiRows, companyRows, readingPeriods, runRows, readingsBySource] = await Promise.all([
    listItems<Json>("ma_source", { fields: SOURCE_FIELDS, sort: "code", limit: 100 }),
    listItems<Json>("ma_kpi", { fields: KPI_FIELDS, filter: { is_active: { _eq: true } }, sort: ["tier", "company_id", "sort"], limit: 400 }),
    listItems<Json>("ma_company", { fields: ["id", "code", "name", "sort"], sort: "sort", limit: 50 }),
    // 5000 newest rows, not 2000: at 2000 the scan lost the oldest month entirely, so the board
    // claimed 2025-02 was the first month that had readings. Ceiling: >5000 rows of history
    // silently drops whole oldest months from the list.
    listItems<Json>("ma_kpi_actual", { fields: ["period"], sort: "-period", limit: 5000 }),
    listItems<Json>("ma_run_log", { fields: ["*"], sort: "-run_at", limit: 12 }),
    countReadingsBySource(),
  ]);

  const periods = Array.from(new Set(readingPeriods.rows.map((row) => asString(row.period)).filter(Boolean))).sort();
  // An empty month is answered as the month that was asked for: silently swapping in the newest
  // month leaves the reader reading someone else's figures without being told.
  const wanted = requested && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : null;
  const period = wanted ?? periods.at(-1) ?? monthOf(new Date().toISOString());
  const nearestPeriod = wanted && !periods.includes(wanted) ? nearestMonth(periods, wanted) : null;

  const companies = new Map(companyRows.rows.map((row) => [asNumber(row.id), { code: asString(row.code), name: asString(row.name) }]));
  const coverage = await buildCoverage(period, kpiRows.rows, new Set(companies.keys()));
  const byId = new Map(kpiRows.rows.map((row) => [asNumber(row.id), row]));
  coverage.missingKpis = coverage.missingKpis.map((row) => {
    const kpi = Array.from(byId.values()).find((item) => asString(item.kpi_key) === row.kpi_key);
    const company = kpi ? companies.get(asNumber(kpi.company_id)) : undefined;
    return { ...row, companyCode: company?.code ?? "unassigned" };
  });

  // The reference's Feeds column: what each source carries for the month on screen, read off the
  // readings that month already returned rather than a second mapping table.
  const feeds = new Map<string, { kpis: Set<number>; companies: Set<number> }>();
  const periodReadings = await listItems<Json>("ma_kpi_actual", {
    fields: ["source_code", "kpi_id"],
    filter: { period: { _eq: period } },
    limit: 5000,
  });
  for (const row of periodReadings.rows) {
    const code = asString(row.source_code);
    if (!code) continue;
    const kpiId = asNumber(row.kpi_id);
    const entry = feeds.get(code) ?? { kpis: new Set<number>(), companies: new Set<number>() };
    entry.kpis.add(kpiId);
    const kpi = byId.get(kpiId);
    if (kpi) entry.companies.add(asNumber(kpi.company_id));
    feeds.set(code, entry);
  }

  return {
    period,
    periods: periods.slice(-24).reverse(),
    nearestPeriod,
    sources: sourceRows.rows.map((row) => {
      const code = asString(row.code);
      const fed = feeds.get(code);
      return mapSource(row, readingsBySource.get(code) ?? 0, { kpis: fed?.kpis.size ?? 0, companies: fed?.companies.size ?? 0 });
    }),
    coverage,
    gates: computeGates(coverage),
    runs: runRows.rows.map<RunRow>((row) => ({
      id: asNumber(row.id),
      kind: asString(row.kind),
      gate: row.gate === null ? null : asString(row.gate),
      period: row.period === null ? null : asString(row.period),
      status: row.status === null ? null : asString(row.status),
      rows_ok: asNumberOrNull(row.rows_ok),
      rows_failed: asNumberOrNull(row.rows_failed),
      detail: row.detail === null ? null : asString(row.detail),
      run_at: row.run_at === null ? null : asString(row.run_at),
    })),
    companies: companyRows.rows.map((row) => ({ id: asNumber(row.id), code: asString(row.code), name: asString(row.name) })),
    kpis: kpiRows.rows.map((row) => ({
      id: asNumber(row.id),
      kpi_key: asString(row.kpi_key),
      name: asString(row.name),
      company_id: asNumber(row.company_id),
      unit: row.unit === null ? null : asString(row.unit),
      dp: asNumber(row.dp, 1),
      rule_type: asString(row.rule_type) || "PCT",
    })),
  };
}

/** One reading per measure and month: an existing row is corrected, not duplicated. */
export async function saveReading(body: ReadingBody, actorId: number | null) {
  const period = body.period.trim();
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw Object.assign(new Error("The month has to look like 2026-11."), { name: "ValidationError" });
  }
  const existing = await listItems<Json>("ma_kpi_actual", {
    fields: ["id", "period", "value"],
    filter: { kpi_id: { _eq: body.kpiId }, period: { _eq: period } },
    sort: "-id",
    limit: 2,
  });

  const now = phtStamp();
  const payload = {
    kpi_id: body.kpiId,
    period,
    value: body.value,
    basis: body.basis === "PROVISIONAL" ? "PROVISIONAL" : "ACTUAL",
    source_code: body.sourceCode ?? "MANUAL",
    note: body.note ?? null,
    updated_at: now,
    updated_by: actorId,
  };

  if (existing.rows.length > 0) {
    const id = asNumber(existing.rows[0].id);
    const updated = await updateItem<Json>("ma_kpi_actual", id, payload);
    return { id, created: false, value: asNumberOrNull(updated.value) };
  }

  const created = await createItem<Json>("ma_kpi_actual", { ...payload, created_at: now, created_by: actorId });
  return { id: asNumber(created.id), created: true, value: asNumberOrNull(created.value) };
}

export async function runValidation(period: string, actorId: number | null) {
  const payload = await loadData(period);
  const now = phtStamp();
  const written: GateResult[] = [];

  for (const gate of payload.gates) {
    await createItem<Json>("ma_run_log", {
      kind: "VALIDATION",
      source_id: null,
      gate: gate.gate,
      period: payload.period,
      status: gate.status,
      rows_ok: gate.rowsOk,
      rows_failed: gate.rowsFailed,
      detail: gate.detail,
      run_at: now,
      run_by: actorId,
      created_at: now,
      created_by: actorId,
      updated_at: now,
      updated_by: actorId,
    });
    written.push(gate);
  }

  return { period: payload.period, gates: written };
}

export interface SourceRefresh {
  code: string;
  name: string;
  readings: number;
  latestPeriod: string | null;
  previousLastSync: string | null;
  lastSyncAt: string;
  fresh: boolean;
}

/**
 * A re-pull re-reads the rows carrying one source code and stamps that read.
 *
 * No upstream connector exists in this build, so the readings are the only store a source has:
 * reading them again is what "re-pull" can honestly mean here. A feed with no rows behind it is
 * refused instead of stamped, because a fresh badge over no data is a lie the board cannot show.
 */
export async function refreshSource(code: string, actorId: number | null): Promise<SourceRefresh> {
  const wanted = code.trim().toUpperCase();
  const found = await listItems<Json>("ma_source", {
    fields: SOURCE_FIELDS,
    filter: { code: { _eq: wanted } },
    limit: 2,
  });
  const source = found.rows[0];
  if (!source) {
    throw Object.assign(new Error(`No source is registered as ${wanted}.`), { name: "NotFoundError" });
  }

  const name = asString(source.name);
  const readings = await listItems<Json>("ma_kpi_actual", {
    fields: ["id", "period"],
    filter: { source_code: { _eq: wanted } },
    sort: "-period",
    limit: 5000,
  });
  if (readings.rows.length === 0) {
    throw Object.assign(
      new Error(`No reading carries the ${wanted} source code, so ${name} has no reader in this build and nothing can be re-pulled.`),
      { name: "ConflictError" },
    );
  }

  const now = phtStamp();
  const sourceId = asNumber(source.id);
  const latestPeriod = asString(readings.rows[0].period) || null;
  const previousLastSync = source.last_sync_at === null ? null : asString(source.last_sync_at);
  const detail = `Re-read ${name}: ${readings.total} reading(s), newest for ${latestPeriod ?? "no month"}.`;
  const sla = asNumber(source.sla_minutes);

  await updateItem<Json>("ma_source", sourceId, { last_sync_at: now, updated_at: now, updated_by: actorId });
  const run = await createItem<Json>("ma_run_log", {
    kind: "REFRESH",
    source_id: sourceId,
    gate: null,
    period: latestPeriod,
    status: "PASS",
    rows_ok: readings.total,
    rows_failed: 0,
    detail,
    run_at: now,
    run_by: actorId,
    created_at: now,
    created_by: actorId,
    updated_at: now,
    updated_by: actorId,
  });

  return {
    code: wanted,
    name,
    readings: readings.total,
    latestPeriod,
    previousLastSync,
    lastSyncAt: asString(run.run_at) || now,
    fresh: sla > 0,
  };
}
