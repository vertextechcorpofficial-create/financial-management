import { listItems, createItem, deleteItem, updateItem, asNumber, asString, asBoolean } from "./directus";
import { phtStamp } from "../pht";
import { computeScenario, zeroLevers } from "./model";
import type { BaselineRow, CompanyKind, Levers, ScenarioPayload, ScenarioRow } from "../types";

type Row = Record<string, unknown>;

const COMPANY_FIELDS = ["id", "code", "name", "kind", "sort"];
const SETTING_FIELDS = ["setting_key", "value"];
const KPI_FIELDS = ["id", "kpi_key", "tier", "unit"];
const ACTUAL_FIELDS = ["kpi_id", "period", "value"];
const SCENARIO_FIELDS = ["id", "name", "base_period", "fx_pct", "levers", "note", "is_active", "created_at", "created_by"];
const KPI_SLUGS = ["cm", "ccc", "opex"];
const DEFAULT_IMPORT: Record<string, number> = { dist: 0.35, mfg: 0.45, sw: 0.05, mech: 0.4, con: 0.2 };
const DEFAULT_USD: Record<string, number> = { dist: 0.1, mfg: 0.6, sw: 0.4, mech: 0.5, con: 0.05 };

const num = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return asNumber(value, fallback);
};

function settingNumber(settings: Map<string, string>, key: string, fallback: number): number {
  const raw = settings.get(key);
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Latest reading of one KPI for one company code, from the stored actuals. */
function latestActual(
  readings: Map<string, { period: string; value: number }>,
  code: string,
  slug: string,
): { period: string; value: number } | null {
  return readings.get(`${code}.${slug}`) ?? null;
}

export async function loadScenario(): Promise<ScenarioPayload> {
  const notices: string[] = [];

  const [companyResult, settingResult, kpiResult] = await Promise.all([
    listItems<Row>("ma_company", { fields: COMPANY_FIELDS, sort: "sort", limit: 50 }),
    listItems<Row>("ma_setting", { fields: SETTING_FIELDS, limit: 200 }),
    listItems<Row>("ma_kpi", { fields: KPI_FIELDS, limit: 200 }),
  ]);

  const settings = new Map<string, string>();
  for (const row of settingResult.rows) {
    settings.set(asString(row.setting_key), asString(row.value));
  }

  const kpiById = new Map<number, { key: string }>();
  for (const row of kpiResult.rows) {
    const id = num(row.id);
    if (id > 0) kpiById.set(id, { key: asString(row.kpi_key) });
  }

  const readings = new Map<string, { period: string; value: number }>();
  if (kpiById.size > 0) {
    const actuals = await listItems<Row>("ma_kpi_actual", { fields: ACTUAL_FIELDS, limit: 20000 });
    for (const row of actuals.rows) {
      const kpi = kpiById.get(num(row.kpi_id));
      if (!kpi) continue;
      const slug = kpi.key.split(".").slice(1).join(".");
      if (!KPI_SLUGS.includes(slug)) continue;
      const period = asString(row.period);
      const current = readings.get(kpi.key);
      if (!current || period > current.period) {
        readings.set(kpi.key, { period, value: num(row.value) });
      }
    }
  }

  const baselines: BaselineRow[] = [];
  for (const row of companyResult.rows) {
    const code = asString(row.code);
    const kind = asString(row.kind) as CompanyKind;
    if (kind === "GROUP") continue;

    const revenueSetting = `baseline_revenue_${code}`;
    const revenue = settingNumber(settings, revenueSetting, 0);
    if (revenue <= 0) {
      notices.push(`No revenue baseline for ${asString(row.name)}. Set ${revenueSetting} in Access and Governance before the planner can size it.`);
    }

    const cm = latestActual(readings, code, "cm");
    const ccc = latestActual(readings, code, "ccc");
    const opex = latestActual(readings, code, "opex");

    if (!cm || !ccc || !opex) {
      notices.push(`${asString(row.name)} is missing a margin, cycle or cost reading, so its run-rate falls back to zero.`);
    }

    baselines.push({
      code,
      name: asString(row.name),
      kind,
      revenue,
      cmPct: cm?.value ?? 0,
      fixed: (opex?.value ?? 0) * 12,
      cccDays: ccc?.value ?? 0,
      importShare: settingNumber(settings, `baseline_import_${code}`, DEFAULT_IMPORT[code] ?? 0.2),
      usdShare: settingNumber(settings, `baseline_usd_${code}`, DEFAULT_USD[code] ?? 0.1),
      revenueBasis: revenue > 0 ? `Setting ${revenueSetting}` : "Not set",
      kpiBasis: [cm && `margin ${cm.period}`, ccc && `cycle ${ccc.period}`, opex && `cost ${opex.period}`]
        .filter(Boolean)
        .join(" · "),
    });
  }

  const saved = await listItems<Row>("ma_scenario", { fields: SCENARIO_FIELDS, sort: "-created_at", limit: 50 });
  const scenarios = saved.rows.map(mapScenario);
  const active = scenarios.find((row) => row.is_active);
  const levers = active ? parseLevers(active.levers, baselines) : zeroLevers(baselines);
  const fxPct = active ? active.fx_pct : 0;

  if (scenarios.length === 0) {
    notices.push("No scenario is saved yet. The planner is showing the run-rate, before any lever moves.");
  }

  return {
    companies: baselines,
    levers,
    result: computeScenario(baselines, levers, fxPct),
    scenarios,
    notices,
  };
}

function mapScenario(row: Row): ScenarioRow {
  return {
    id: num(row.id),
    name: asString(row.name),
    base_period: asString(row.base_period),
    fx_pct: num(row.fx_pct),
    levers: row.levers,
    note: row.note === null || row.note === undefined ? null : asString(row.note),
    is_active: asBoolean(row.is_active),
    created_at: row.created_at ? asString(row.created_at) : null,
    created_by: row.created_by === null || row.created_by === undefined ? null : num(row.created_by),
  };
}

/** Levers come back as JSON, but a hand-edited row can be a string, so both shapes are read. */
export function parseLevers(raw: unknown, baselines: BaselineRow[]): Levers[] {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  const map = new Map<string, Levers>();
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const code = asString(entry.code);
      if (!code) continue;
      map.set(code, {
        code,
        revenuePct: num(entry.revenuePct),
        cmPoints: num(entry.cmPoints),
        fixedPct: num(entry.fixedPct),
        cccDays: num(entry.cccDays),
      });
    }
  }
  return baselines.map(
    (row) => map.get(row.code) ?? { code: row.code, revenuePct: 0, cmPoints: 0, fixedPct: 0, cccDays: 0 },
  );
}

export interface ScenarioBody {
  name: string;
  basePeriod: string;
  fxPct: number;
  note: string | null;
  levers: Levers[];
}

export async function saveScenario(body: ScenarioBody, actorId: number | null): Promise<ScenarioRow> {
  const payload = {
    name: body.name.trim(),
    base_period: body.basePeriod,
    fx_pct: body.fxPct,
    levers: body.levers,
    note: body.note,
    is_active: true,
    created_at: phtStamp(),
    created_by: actorId,
    updated_at: phtStamp(),
    updated_by: actorId,
  };
  const created = await createItem<Row>("ma_scenario", payload);
  // Only one scenario is the live one, so every other row steps back.
  const others = await listItems<Row>("ma_scenario", { fields: ["id", "is_active"], limit: 200 });
  for (const row of others.rows) {
    const id = num(row.id);
    if (id !== num(created.id) && asBoolean(row.is_active)) {
      await updateItem("ma_scenario", id, { is_active: false, updated_at: phtStamp(), updated_by: actorId });
    }
  }
  return mapScenario(created);
}

export async function activateScenario(id: number, actorId: number | null): Promise<ScenarioRow> {
  const all = await listItems<Row>("ma_scenario", { fields: ["id", "is_active"], limit: 200 });
  for (const row of all.rows) {
    const rowId = num(row.id);
    const wanted = rowId === id;
    if (asBoolean(row.is_active) !== wanted) {
      await updateItem("ma_scenario", rowId, { is_active: wanted, updated_at: phtStamp(), updated_by: actorId });
    }
  }
  const refreshed = await listItems<Row>("ma_scenario", { fields: SCENARIO_FIELDS, filter: { id: { _eq: id } }, limit: 1 });
  const row = refreshed.rows[0];
  if (!row) throw new Error("That scenario no longer exists.");
  return mapScenario(row);
}

/** A refused write travels to the route as a 409 with this sentence intact. */
class ConflictError extends Error {
  name = "ConflictError";
}

export async function deleteScenario(id: number): Promise<void> {
  const rows = await listItems<Row>("ma_scenario", { fields: ["id", "is_active"], filter: { id: { _eq: id } }, limit: 1 });
  const row = rows.rows[0];
  if (!row) throw new Error("That scenario no longer exists.");
  if (asBoolean(row.is_active)) {
    // Deleting the live case would leave the planner with zeros and no explanation.
    throw new ConflictError("This scenario is live. Activate another one first, then remove it.");
  }
  await deleteItem("ma_scenario", id);
}
