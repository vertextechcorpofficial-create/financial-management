import { listItems, createItem, deleteItem, updateItem, asNumber, asString, asBoolean } from "./directus";
import { phtStamp } from "../pht";
import { computeScenario, zeroLevers } from "./model";
import type { BaselineRow, Levers, ScenarioPayload, ScenarioRow } from "../types";

type Row = Record<string, unknown>;

const COMPANY_FIELDS = ["id", "code", "name", "kind", "sort"];
const KPI_FIELDS = ["id", "kpi_key", "tier", "unit"];
const SCENARIO_FIELDS = ["id", "name", "base_period", "fx_pct", "levers", "note", "is_active", "created_at", "created_by"];

const num = (value: unknown, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return asNumber(value, fallback);
};

async function resolveMen2Name(): Promise<string> {
  try {
    const res = await listItems<Row>("company_list", {
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

export async function loadScenario(): Promise<ScenarioPayload> {
  const notices: string[] = [];

  const [companyResult, kpiResult, men2Name, saved] = await Promise.all([
    listItems<Row>("ma_company", { fields: COMPANY_FIELDS, sort: "sort", limit: 50 }),
    listItems<Row>("ma_kpi", { fields: KPI_FIELDS, limit: 200 }),
    resolveMen2Name(),
    listItems<Row>("ma_scenario", { fields: SCENARIO_FIELDS, sort: "-created_at", limit: 50 }),
  ]);

  const distCompany = companyResult.rows.find((r) => asString(r.code) === "dist");
  const distId = distCompany ? num(distCompany.id) : null;

  const opexKpiIds = kpiResult.rows
    .filter((row) => asString(row.kpi_key) === "dist.opex" && (distId === null || num(row.company_id) === distId))
    .map((row) => num(row.id))
    .filter((id) => id > 0);

  let latestOpexMonthly: number | null = null;
  let latestOpexPeriod: string | null = null;
  if (opexKpiIds.length > 0) {
    const actuals = await listItems<Row>("ma_kpi_actual", {
      fields: ["kpi_id", "period", "value"],
      filter: { kpi_id: { _in: opexKpiIds }, source_code: { _eq: "ERP" } },
      sort: "-period",
      limit: 10,
    });
    const newest = actuals.rows[0];
    if (newest) {
      latestOpexMonthly = num(newest.value);
      latestOpexPeriod = asString(newest.period);
    }
  }

  // Per MANAGEMENT ANALYTICS API.md §8, Revenue, Contribution Margin, Cash Conversion Cycle,
  // and non-MEN2 entities are not exposed by ERP_SERVER yet. Do not invent baseline revenue/CM numbers.
  const baselines: BaselineRow[] = distCompany
    ? [
        {
          code: "dist",
          name: men2Name,
          kind: "OPERATING",
          revenue: 0,
          cmPct: 0,
          fixed: latestOpexMonthly !== null ? latestOpexMonthly * 12 : 0,
          cccDays: 0,
          importShare: 0,
          usdShare: 0,
          revenueBasis: "Not returned by ERP API yet",
          kpiBasis: latestOpexPeriod ? `dist.opex ${latestOpexPeriod} (ERP)` : "No ERP opex synced yet",
        },
      ]
    : [];

  notices.push(
    "ERP_SERVER currently exposes the 8 operational & opex KPIs for MEN2 only. Revenue, Contribution Margin, and Cash Conversion Cycle endpoints are pending (MANAGEMENT ANALYTICS API.md §8).",
  );

  const scenarios = saved.rows.map(mapScenario);
  const levers = zeroLevers(baselines);

  return {
    companies: baselines,
    levers,
    result: computeScenario(baselines, levers, 0),
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
