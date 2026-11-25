import type {
  CountLineRow,
  CountLinesResponse,
  CountLookups,
  CountSessionDetail,
  CountSessionInput,
  CountSessionSummary,
  CountSessionsResponse,
  CountStats,
  CountStatus,
  LguAsset,
  LguCountLine,
  LguCountSession,
} from "../../types";
import { countPrefix } from "../../types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

function auth(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: "Bearer " + (TOKEN ?? "") };
}

function url(path: string): string {
  if (!BASE) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  return BASE.replace(/\/+$/, "") + path;
}

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}

interface JsonResult {
  data?: unknown;
  meta?: { filter_count?: number };
}

async function get(path: string): Promise<JsonResult> {
  const res = await fetch(url(path), { headers: auth(), cache: "no-store" });
  const body = await res.text();
  if (!res.ok) throw new Error("GET " + res.status + ": " + body.slice(0, 250));
  return JSON.parse(body) as JsonResult;
}

async function post(path: string, payload: unknown): Promise<JsonResult> {
  const res = await fetch(url(path), { method: "POST", headers: auth(), body: JSON.stringify(payload) });
  const body = await res.text();
  if (!res.ok) throw new Error("POST " + res.status + ": " + body.slice(0, 250));
  return JSON.parse(body) as JsonResult;
}

async function patch(path: string, payload: unknown): Promise<JsonResult> {
  const res = await fetch(url(path), { method: "PATCH", headers: auth(), body: JSON.stringify(payload) });
  const body = await res.text();
  if (!res.ok) throw new Error("PATCH " + res.status + ": " + body.slice(0, 250));
  return JSON.parse(body) as JsonResult;
}

function mapSession(row: Record<string, unknown>): LguCountSession {
  return {
    id: Number(row.id),
    count_no: text(row.count_no),
    as_of_date: (row.as_of_date as string) ?? null,
    office_id: num(row.office_id),
    class_id: num(row.class_id),
    session_status: ((row.session_status as string) ?? "draft") as CountStatus,
    counted_by: (row.counted_by as string) ?? null,
    verified_by: (row.verified_by as string) ?? null,
    witnessed_by: (row.witnessed_by as string) ?? null,
    remarks: (row.remarks as string) ?? null,
    status: text(row.status) || "active",
  };
}

function mapLine(row: Record<string, unknown>): LguCountLine {
  return {
    id: Number(row.id),
    count_id: Number(row.count_id),
    asset_id: num(row.asset_id),
    expected_officer: (row.expected_officer as string) ?? null,
    expected_office_id: num(row.expected_office_id),
    found: row.found === null || row.found === undefined ? null : bool(row.found),
    condition_id: num(row.condition_id),
    location_seen: (row.location_seen as string) ?? null,
    resolution: ((row.resolution as string) ?? "pending") as LguCountLine["resolution"],
    remarks: (row.remarks as string) ?? null,
    counted_at: (row.counted_at as string) ?? null,
    counted_by: (row.counted_by as string) ?? null,
    is_found_at_station: bool(row.is_found_at_station),
    station_description: (row.station_description as string) ?? null,
    station_cost: num(row.station_cost),
    station_location: (row.station_location as string) ?? null,
    approved_by: (row.approved_by as string) ?? null,
    status: text(row.status) || "active",
  };
}

function mapAsset(row: Record<string, unknown>): LguAsset {
  return {
    id: Number(row.id),
    property_no: text(row.property_no),
    description: text(row.description),
    class_id: num(row.class_id),
    is_semi_expendable: bool(row.is_semi_expendable),
    cost: num(row.cost),
    acquisition_date: (row.acquisition_date as string) ?? null,
    available_for_use_date: (row.available_for_use_date as string) ?? null,
    life_months: num(row.life_months),
    residual_value: num(row.residual_value),
    office_id: num(row.office_id),
    accountable_officer_id: num(row.accountable_officer_id),
    accountable_officer_name: (row.accountable_officer_name as string) ?? null,
    location: (row.location as string) ?? null,
    condition_id: num(row.condition_id),
    mode_of_acquisition: ((row.mode_of_acquisition as string) ?? "purchase") as LguAsset["mode_of_acquisition"],
    fund_source_id: num(row.fund_source_id),
    donor_name: (row.donor_name as string) ?? null,
    supplier: (row.supplier as string) ?? null,
    po_no: (row.po_no as string) ?? null,
    invoice_no: (row.invoice_no as string) ?? null,
    iar_no: (row.iar_no as string) ?? null,
    par_no: (row.par_no as string) ?? null,
    ics_no: (row.ics_no as string) ?? null,
    serial_no: (row.serial_no as string) ?? null,
    brand: (row.brand as string) ?? null,
    model: (row.model as string) ?? null,
    remarks: (row.remarks as string) ?? null,
    record_status: ((row.record_status as string) ?? "active") as LguAsset["record_status"],
    unit_of_measure: text(row.unit_of_measure) || "pc",
    is_bulk_child: bool(row.is_bulk_child),
    bulk_batch_id: (row.bulk_batch_id as string) ?? null,
    batch_total: num(row.batch_total),
    rounding_remainder: num(row.rounding_remainder),
    voucher_no: (row.voucher_no as string) ?? null,
    status: text(row.status) || "active",
  };
}

async function fetchLookups(): Promise<CountLookups> {
  const active = encodeURIComponent(JSON.stringify({ status: { _eq: "active" } }));
  const [offices, classes, conditions] = await Promise.all([
    get("/items/lgu_office?filter=" + active + "&sort=sort&limit=-1"),
    get("/items/lgu_asset_class?filter=" + active + "&sort=sort&limit=-1"),
    get("/items/lgu_condition?filter=" + active + "&sort=sort&limit=-1"),
  ]);
  const rows = (r: JsonResult) => ((r.data ?? []) as Record<string, unknown>[]);
  return {
    offices: rows(offices).map((o) => ({ id: Number(o.id), code: text(o.code), name: text(o.name), sort: num(o.sort), status: text(o.status) })),
    classes: rows(classes).map((c) => ({
      id: Number(c.id),
      code: text(c.code),
      name: text(c.name),
      property_prefix: text(c.property_prefix),
      default_life_months: num(c.default_life_months),
      depreciable: bool(c.depreciable),
      sort: num(c.sort),
      status: text(c.status),
    })),
    conditions: rows(conditions).map((c) => ({
      id: Number(c.id),
      name: text(c.name),
      is_serviceable: bool(c.is_serviceable),
      sort: num(c.sort),
      status: text(c.status),
    })),
  };
}

export function computeStats(lines: LguCountLine[]): CountStats {
  const total = lines.length;
  const counted = lines.filter((l) => l.found !== null).length;
  const found = lines.filter((l) => l.found === true).length;
  const notFound = lines.filter((l) => l.found === false).length;
  const pendingResolution = lines.filter((l) => l.found === false && l.resolution === "pending").length;
  const foundAtStation = lines.filter((l) => l.is_found_at_station).length;
  return { total, counted, found, notFound, pendingResolution, foundAtStation, readyToLock: total > 0 && counted === total && pendingResolution === 0 };
}

export async function fetchCountSessions(): Promise<CountSessionsResponse> {
  const [sessionsJson, linesJson, lookups] = await Promise.all([
    get("/items/lgu_asset_counts?filter=" + encodeURIComponent(JSON.stringify({ status: { _eq: "active" } })) + "&sort=-as_of_date,-id&limit=-1"),
    get("/items/lgu_asset_count_lines?fields=count_id,found,resolution&limit=-1"),
    fetchLookups(),
  ]);

  const sessions = ((sessionsJson.data ?? []) as Record<string, unknown>[]).map(mapSession);
  const bySession = new Map<number, LguCountLine[]>();
  for (const raw of (linesJson.data ?? []) as Record<string, unknown>[]) {
    const line = mapLine(raw);
    const list = bySession.get(line.count_id) ?? [];
    list.push(line);
    bySession.set(line.count_id, list);
  }

  const summaries: CountSessionSummary[] = sessions.map((session) => {
    const lines = bySession.get(session.id) ?? [];
    const stats = computeStats(lines);
    return {
      session,
      totalLines: stats.total,
      counted: stats.counted,
      notFound: stats.notFound,
      pendingResolution: stats.pendingResolution,
    };
  });

  return { sessions: summaries, lookups };
}

async function highestCountSequence(year: number): Promise<number> {
  const stem = countPrefix(year);
  const filter = JSON.stringify({ count_no: { _starts_with: stem } });
  const json = await get("/items/lgu_asset_counts?filter=" + encodeURIComponent(filter) + "&fields=count_no&limit=-1");
  let max = 0;
  for (const row of (json.data ?? []) as Record<string, unknown>[]) {
    const n = parseInt(text(row.count_no).slice(stem.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * Creates a session and snapshots one line per asset in scope.
 * The snapshot is the whole point: a transfer next year must not rewrite what
 * this count says the officer was today.
 */
export async function createCountSession(input: CountSessionInput): Promise<CountSessionDetail> {
  if (!input.as_of_date) throw new Error("The as of date is required");

  const and: Record<string, unknown>[] = [
    { status: { _eq: "active" } },
    { record_status: { _neq: "disposed" } },
  ];
  if (input.office_id) and.push({ office_id: { _eq: input.office_id } });
  if (input.class_id) and.push({ class_id: { _eq: input.class_id } });

  const assetsJson = await get(
    "/items/lgu_asset?filter=" + encodeURIComponent(JSON.stringify({ _and: and })) +
    "&sort=property_no&limit=-1&fields=id,property_no,description,class_id,is_semi_expendable,cost,office_id,accountable_officer_name,condition_id,record_status,status,unit_of_measure"
  );
  const assets = ((assetsJson.data ?? []) as Record<string, unknown>[]).map(mapAsset);
  if (assets.length === 0) {
    throw new Error("No assets match that scope. Nothing to count, so no session was created");
  }

  const year = new Date(input.as_of_date).getFullYear();
  let session: LguCountSession | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const seq = await highestCountSequence(year);
    const countNo = countPrefix(year) + String(seq + 1).padStart(4, "0");
    try {
      const created = await post("/items/lgu_asset_counts", {
        count_no: countNo,
        as_of_date: input.as_of_date,
        office_id: input.office_id ?? null,
        class_id: input.class_id ?? null,
        session_status: "draft",
        counted_by: input.counted_by ?? null,
        verified_by: input.verified_by ?? null,
        witnessed_by: input.witnessed_by ?? null,
        remarks: input.remarks ?? null,
        status: "active",
      });
      session = mapSession(created.data as Record<string, unknown>);
      break;
    } catch (err) {
      lastError = err;
      const msg = String(err instanceof Error ? err.message : err);
      if (!msg.includes("has to be unique")) throw err;
    }
  }
  if (!session) throw lastError instanceof Error ? lastError : new Error("Could not allocate a count number");

  const lines = assets.map((asset) => ({
    count_id: session!.id,
    asset_id: asset.id,
    expected_officer: asset.accountable_officer_name,
    expected_office_id: asset.office_id,
    found: null,
    condition_id: null,
    location_seen: null,
    resolution: "pending",
    remarks: null,
    is_found_at_station: false,
    status: "active",
  }));

  await post("/items/lgu_asset_count_lines", lines);
  return fetchCountSession(session.id);
}

export async function fetchCountSession(id: number): Promise<CountSessionDetail> {
  const sessionJson = await get("/items/lgu_asset_counts/" + id);
  if (!sessionJson.data) throw new Error("Count session " + id + " not found");
  const session = mapSession(sessionJson.data as Record<string, unknown>);

  const linesJson = await get(
    "/items/lgu_asset_count_lines?filter=" + encodeURIComponent(JSON.stringify({ count_id: { _eq: id }, status: { _eq: "active" } })) + "&sort=id&limit=-1"
  );
  const lines = ((linesJson.data ?? []) as Record<string, unknown>[]).map(mapLine);

  const assetIds = Array.from(new Set(lines.map((l) => l.asset_id).filter((v): v is number => typeof v === "number")));
  let assetMap = new Map<number, LguAsset>();
  if (assetIds.length) {
    const assetsJson = await get(
      "/items/lgu_asset?filter=" + encodeURIComponent(JSON.stringify({ id: { _in: assetIds } })) +
      "&limit=-1&fields=id,property_no,description,class_id,is_semi_expendable,cost,acquisition_date,available_for_use_date,life_months,residual_value,office_id,accountable_officer_id,accountable_officer_name,location,condition_id,mode_of_acquisition,fund_source_id,donor_name,supplier,po_no,invoice_no,iar_no,par_no,ics_no,serial_no,brand,model,remarks,record_status,unit_of_measure,is_bulk_child,bulk_batch_id,batch_total,rounding_remainder,voucher_no,status"
    );
    assetMap = new Map(((assetsJson.data ?? []) as Record<string, unknown>[]).map((r) => [Number(r.id), mapAsset(r)]));
  }

  const rows: CountLineRow[] = lines.map((line) => ({
    line,
    asset: line.asset_id ? assetMap.get(line.asset_id) ?? null : null,
  }));

  return { session, lines: rows, stats: computeStats(lines) };
}

export async function fetchCountLines(
  id: number,
  filter: "all" | "uncounted" | "found" | "notfound" | "pending" | "station" = "all"
): Promise<CountLinesResponse> {
  const detail = await fetchCountSession(id);
  const rows = detail.lines.filter((row) => {
    if (filter === "uncounted") return row.line.found === null;
    if (filter === "found") return row.line.found === true;
    if (filter === "notfound") return row.line.found === false;
    if (filter === "pending") return row.line.found === false && row.line.resolution === "pending";
    if (filter === "station") return row.line.is_found_at_station;
    return true;
  });
  return { session: detail.session, lines: rows, stats: detail.stats };
}

/** Marks one line. Never creates a second line for the same asset. */
export async function markCountLine(input: {
  countId: number;
  assetId?: number | null;
  lineId?: number | null;
  found: boolean;
  conditionId?: number | null;
  locationSeen?: string | null;
  remarks?: string | null;
  countedBy?: string | null;
}): Promise<CountSessionDetail> {
  const sessionJson = await get("/items/lgu_asset_counts/" + input.countId);
  if (!sessionJson.data) throw new Error("Count session not found");
  const session = mapSession(sessionJson.data as Record<string, unknown>);
  if (session.session_status === "locked" || session.session_status === "submitted") {
    throw new Error("This session is locked. Reopen it before marking lines");
  }

  let lineId = input.lineId ?? null;
  if (!lineId) {
    if (!input.assetId) throw new Error("Either lineId or assetId is required");
    const filter = JSON.stringify({ count_id: { _eq: input.countId }, asset_id: { _eq: input.assetId } });
    const existing = await get("/items/lgu_asset_count_lines?filter=" + encodeURIComponent(filter) + "&fields=id&limit=1");
    const row = ((existing.data ?? []) as Record<string, unknown>[])[0];
    if (!row) throw new Error("That asset is not part of this count");
    lineId = Number(row.id);
  }

  await patch("/items/lgu_asset_count_lines/" + lineId, {
    found: input.found,
    condition_id: input.conditionId ?? null,
    location_seen: input.locationSeen ?? null,
    remarks: input.remarks ?? null,
    counted_at: new Date().toISOString(),
    counted_by: input.countedBy ?? null,
    resolution: input.found ? "confirmed" : "pending",
  });

  if (session.session_status === "draft") {
    await patch("/items/lgu_asset_counts/" + session.id, { session_status: "counting" });
  }

  return fetchCountSession(session.id);
}
