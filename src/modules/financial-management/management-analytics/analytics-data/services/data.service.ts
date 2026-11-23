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

function mapSource(row: Json): SourceRow {
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
  };
}

function monthOf(isoDay: string): string {
  return isoDay.slice(0, 7);
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
      companyCode: "—",
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
  const [sourceRows, kpiRows, companyRows, readingPeriods, runRows] = await Promise.all([
    listItems<Json>("ma_source", { fields: ["*"], sort: "code", limit: 100 }),
    listItems<Json>("ma_kpi", { fields: KPI_FIELDS, filter: { is_active: { _eq: true } }, sort: ["tier", "company_id", "sort"], limit: 400 }),
    listItems<Json>("ma_company", { fields: ["id", "code", "name", "sort"], sort: "sort", limit: 50 }),
    listItems<Json>("ma_kpi_actual", { fields: ["period"], sort: "-period", limit: 2000 }),
    listItems<Json>("ma_run_log", { fields: ["*"], sort: "-run_at", limit: 12 }),
  ]);

  const periods = Array.from(new Set(readingPeriods.rows.map((row) => asString(row.period)).filter(Boolean))).sort();
  const period = requested && periods.includes(requested) ? requested : periods.at(-1) ?? monthOf(new Date().toISOString());

  const companies = new Map(companyRows.rows.map((row) => [asNumber(row.id), { code: asString(row.code), name: asString(row.name) }]));
  const coverage = await buildCoverage(period, kpiRows.rows, new Set(companies.keys()));
  const byId = new Map(kpiRows.rows.map((row) => [asNumber(row.id), row]));
  coverage.missingKpis = coverage.missingKpis.map((row) => {
    const kpi = Array.from(byId.values()).find((item) => asString(item.kpi_key) === row.kpi_key);
    const company = kpi ? companies.get(asNumber(kpi.company_id)) : undefined;
    return { ...row, companyCode: company?.code ?? "—" };
  });

  return {
    period,
    periods: periods.slice(-24).reverse(),
    sources: sourceRows.rows.map(mapSource),
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
