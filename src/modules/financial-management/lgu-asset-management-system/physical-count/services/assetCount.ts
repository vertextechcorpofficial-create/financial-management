import type {
  CountLineRow,
  CountLinesResponse,
  CountLookups,
  CountReport,
  CountReportGroup,
  CountReportRow,
  CountSessionDetail,
  CountSessionInput,
  CountSessionSummary,
  CountSessionsResponse,
  CountStats,
  CountStatus,
  LguAsset,
  LguCountLine,
  LguCountSession,
  ResolveLineInput,
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
    total_lines: Number(row.total_lines ?? 0),
    counted_lines: Number(row.counted_lines ?? 0),
    not_found_lines: Number(row.not_found_lines ?? 0),
    pending_lines: Number(row.pending_lines ?? 0),
    status: text(row.status) || "active",
  };
}

function mapLine(row: Record<string, unknown>): LguCountLine {
  return {
    id: Number(row.id),
    count_id: Number(row.count_id),
    asset_id: num(row.asset_id),
    expected_property_no: (row.expected_property_no as string) ?? null,
    expected_description: (row.expected_description as string) ?? null,
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
    disposed_at: (row.disposed_at as string) ?? null,
    disposal_reason: (row.disposal_reason as string) ?? null,
    book_value_at_disposal: num(row.book_value_at_disposal),
    unit_of_measure: text(row.unit_of_measure) || "pc",
    is_bulk_child: bool(row.is_bulk_child),
    bulk_batch_id: (row.bulk_batch_id as string) ?? null,
    batch_total: num(row.batch_total),
    rounding_remainder: num(row.rounding_remainder),
    voucher_no: (row.voucher_no as string) ?? null,
    status: text(row.status) || "active",
  };
}

let lookupCache: { at: number; data: CountLookups } | null = null;
const LOOKUP_TTL_MS = 60_000;

async function fetchLookupsRaw(): Promise<CountLookups> {
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

/**
 * Offices, classes and conditions change rarely, so they are cached for a
 * minute per server instance. Three round trips per request become one a minute.
 */
async function fetchLookups(): Promise<CountLookups> {
  const now = Date.now();
  if (lookupCache && now - lookupCache.at < LOOKUP_TTL_MS) return lookupCache.data;
  const data = await fetchLookupsRaw();
  lookupCache = { at: now, data };
  return data;
}

async function countLinesWhere(filter: Record<string, unknown>): Promise<number> {
  const json = await get(
    "/items/lgu_asset_count_lines?aggregate[count]=id&filter=" + encodeURIComponent(JSON.stringify(filter))
  );
  const row = ((json.data ?? []) as Record<string, unknown>[])[0];
  const count = row?.count as Record<string, unknown> | undefined;
  return Number(count?.id ?? 0);
}

/**
 * Recomputes the counters stored on the session. Called after every mutation,
 * so the sessions list never has to read a single count line.
 */
export async function recountSession(id: number): Promise<void> {
  const base = { count_id: { _eq: id }, status: { _eq: "active" } };
  const [total, counted, notFound, pending] = await Promise.all([
    countLinesWhere(base),
    countLinesWhere({ ...base, found: { _nnull: true } }),
    countLinesWhere({ ...base, found: { _eq: false } }),
    countLinesWhere({ ...base, found: { _eq: false }, resolution: { _eq: "pending" } }),
  ]);
  await patch("/items/lgu_asset_counts/" + id, {
    total_lines: total,
    counted_lines: counted,
    not_found_lines: notFound,
    pending_lines: pending,
  });
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

/**
 * Reads only the session rows. Progress comes from the counters maintained on
 * each row, so this stays constant however many count lines exist.
 */
export async function fetchCountSessions(): Promise<CountSessionsResponse> {
  const [sessionsJson, lookups] = await Promise.all([
    get("/items/lgu_asset_counts?filter=" + encodeURIComponent(JSON.stringify({ status: { _eq: "active" } })) + "&sort=-as_of_date,-id&limit=-1"),
    fetchLookups(),
  ]);

  const sessions = ((sessionsJson.data ?? []) as Record<string, unknown>[]).map(mapSession);
  const summaries: CountSessionSummary[] = sessions.map((session) => ({
    session,
    totalLines: session.total_lines,
    counted: session.counted_lines,
    notFound: session.not_found_lines,
    pendingResolution: session.pending_lines,
  }));

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
    expected_property_no: asset.property_no,
    expected_description: asset.description,
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
  await patch("/items/lgu_asset_counts/" + session.id, { total_lines: lines.length });
  await recountSession(session.id);
  return fetchCountSession(session.id);
}

export async function fetchCountSession(id: number, withAssets = false): Promise<CountSessionDetail> {
  const sessionJson = await get("/items/lgu_asset_counts/" + id);
  if (!sessionJson.data) throw new Error("Count session " + id + " not found");
  const session = mapSession(sessionJson.data as Record<string, unknown>);

  const linesJson = await get(
    "/items/lgu_asset_count_lines?filter=" + encodeURIComponent(JSON.stringify({ count_id: { _eq: id }, status: { _eq: "active" } })) + "&sort=id&limit=-1"
  );
  const lines = ((linesJson.data ?? []) as Record<string, unknown>[]).map(mapLine);

  // the sheet renders from the snapshot, so the asset join is only needed for reports
  if (!withAssets) {
    const lookups = await fetchLookups();
    return {
      session,
      lines: lines.map((line) => ({ line, asset: null })),
      stats: computeStats(lines),
      lookups,
    };
  }

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

  const lookups = await fetchLookups();
  return { session, lines: rows, stats: computeStats(lines), lookups };
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
  await recountSession(session.id);

  return fetchCountSession(session.id);
}

/* ---------- reconciliation ---------- */

async function loadSession(id: number): Promise<LguCountSession> {
  const json = await get("/items/lgu_asset_counts/" + id);
  if (!json.data) throw new Error("Count session " + id + " not found");
  return mapSession(json.data as Record<string, unknown>);
}

async function loadLine(lineId: number): Promise<LguCountLine> {
  const json = await get("/items/lgu_asset_count_lines/" + lineId);
  if (!json.data) throw new Error("Count line " + lineId + " not found");
  return mapLine(json.data as Record<string, unknown>);
}

function assertOpen(session: LguCountSession) {
  if (session.session_status === "locked" || session.session_status === "submitted") {
    throw new Error("This session is locked. Reopen it before changing lines");
  }
}

/**
 * A not found line becomes either missing or moved.
 * Moved is a real custody transfer: the asset changes hands in the register,
 * and the count records where it was actually seen.
 */
export async function resolveCountLine(input: ResolveLineInput): Promise<CountSessionDetail> {
  const session = await loadSession(input.countId);
  assertOpen(session);
  const line = await loadLine(input.lineId);
  if (line.count_id !== session.id) throw new Error("That line does not belong to this session");
  if (line.found !== false && input.resolution === "missing") {
    throw new Error("Only a line marked not found can be resolved");
  }

  // found at another station: the asset exists, but not with its accountable officer
  if (input.resolution === "station") {
    const description = (input.stationDescription ?? "").trim();
    if (!description) throw new Error("Say which station it was found at");
    const cost = Number(input.stationCost ?? 0);
    if (!Number.isFinite(cost) || cost < 0) throw new Error("The value at the station must be zero or more");

    await patch("/items/lgu_asset_count_lines/" + line.id, {
      found: true,
      resolution: "station",
      is_found_at_station: true,
      station_description: description,
      station_location: (input.stationLocation ?? "").trim() || null,
      station_cost: cost,
      approved_by: (input.approvedBy ?? "").trim() || null,
      location_seen: input.locationSeen ?? line.location_seen,
      remarks: input.remarks ?? line.remarks,
    });
    await recountSession(session.id);
    return fetchCountSession(session.id);
  }

  if (input.resolution === "missing") {
    await patch("/items/lgu_asset_count_lines/" + line.id, {
      resolution: "missing",
      remarks: input.remarks ?? line.remarks,
    });
    await recountSession(session.id);
    return fetchCountSession(session.id);
  }

  if (!input.toOfficeId) throw new Error("A moved asset needs the office where it was actually found");

  const assetJson = line.asset_id ? await get("/items/lgu_asset/" + line.asset_id) : null;
  const asset = assetJson && assetJson.data ? mapAsset(assetJson.data as Record<string, unknown>) : null;
  if (!asset) throw new Error("That line has no asset on the register, so it cannot be transferred");

  await post("/items/lgu_asset_movements", {
    asset_id: asset.id,
    movement: "transfer",
    movement_date: new Date().toISOString().slice(0, 10),
    from_office_id: asset.office_id,
    to_office_id: input.toOfficeId,
    from_officer: asset.accountable_officer_name,
    to_officer: input.toOfficer ?? asset.accountable_officer_name,
    document_id: null,
    remarks: "Established during " + session.count_no + (input.remarks ? ": " + input.remarks : ""),
    created_by: input.encoder ?? null,
    status: "active",
  });

  await patch("/items/lgu_asset/" + asset.id, {
    office_id: input.toOfficeId,
    accountable_officer_name: input.toOfficer ?? asset.accountable_officer_name,
    record_status: "active",
  });

  await patch("/items/lgu_asset_count_lines/" + line.id, {
    found: true,
    resolution: "moved",
    location_seen: input.locationSeen ?? line.location_seen,
    remarks: input.remarks ?? line.remarks,
  });
  await recountSession(session.id);

  return fetchCountSession(session.id);
}

/* ---------- lock, reopen, submit ---------- */

export async function lockCountSession(id: number): Promise<CountSessionDetail> {
  const session = await loadSession(id);
  if (session.session_status === "locked" || session.session_status === "submitted") {
    throw new Error("This session is already locked");
  }
  const detail = await fetchCountSession(id);
  if (detail.stats.total === 0) throw new Error("An empty session cannot be locked");
  if (detail.stats.counted !== detail.stats.total) {
    throw new Error("Cannot lock: " + (detail.stats.total - detail.stats.counted) + " lines are still uncounted");
  }
  if (detail.stats.pendingResolution > 0) {
    throw new Error("Cannot lock: " + detail.stats.pendingResolution + " not found lines still need a decision");
  }

  await patch("/items/lgu_asset_counts/" + id, {
    session_status: "locked",
    locked_at: new Date().toISOString(),
  });

  // the register only changes here, never during counting
  const missingAssetIds = detail.lines
    .filter((row) => row.line.resolution === "missing" && row.line.asset_id)
    .map((row) => row.line.asset_id as number);
  for (const assetId of missingAssetIds) {
    await patch("/items/lgu_asset/" + assetId, { record_status: "missing" });
  }

  return fetchCountSession(id);
}

export async function reopenCountSession(id: number, reason: string): Promise<CountSessionDetail> {
  const session = await loadSession(id);
  if (session.session_status !== "locked") throw new Error("Only a locked session can be reopened");
  if (!reason || !reason.trim()) throw new Error("A reason is required to reopen a locked session");

  const stamp = new Date().toISOString().slice(0, 10);
  await patch("/items/lgu_asset_counts/" + id, {
    session_status: "counting",
    locked_at: null,
    remarks: ((session.remarks ? session.remarks + " | " : "") + "Reopened " + stamp + ": " + reason.trim()).slice(0, 2000),
  });
  return fetchCountSession(id);
}

export async function submitCountSession(id: number, submittedTo: string): Promise<CountSessionDetail> {
  const session = await loadSession(id);
  if (session.session_status !== "locked") throw new Error("Only a locked session can be submitted");
  if (!submittedTo || !submittedTo.trim()) throw new Error("Say who received the report");

  await patch("/items/lgu_asset_counts/" + id, {
    session_status: "submitted",
    submitted_at: new Date().toISOString(),
    submitted_to: submittedTo.trim(),
  });
  return fetchCountSession(id);
}

/* ---------- report ---------- */

async function classNameMap(): Promise<Map<number, string>> {
  const json = await get("/items/lgu_asset_class?fields=id,name&limit=-1");
  const map = new Map<number, string>();
  for (const row of (json.data ?? []) as Record<string, unknown>[]) {
    map.set(Number(row.id), text(row.name));
  }
  return map;
}

function lineRemark(row: CountLineRow, conditionName: string | undefined): string {
  const bits: string[] = [];
  if (conditionName) bits.push(conditionName);
  if (row.line.resolution === "missing") bits.push("missing");
  if (row.line.resolution === "moved") bits.push("found elsewhere");
  if (row.line.resolution === "station") {
    bits.push(
      "found at " + (row.line.station_description ?? "another station") +
      (row.line.station_location ? " (" + row.line.station_location + ")" : "") +
      (row.line.station_cost ? ", value PHP " + row.line.station_cost.toFixed(2) : "") +
      (row.line.approved_by ? ", approved by " + row.line.approved_by : "")
    );
  }
  if (row.line.location_seen) bits.push(row.line.location_seen);
  if (row.line.remarks) bits.push(row.line.remarks);
  return bits.join(", ");
}

/**
 * Builds the RPCPPE (PPE) or RPCSP (semi-expendable) report from the same rows
 * the screen shows, so the printed form and the screen can never disagree.
 */
export async function buildCountReport(id: number, form: "rpcppe" | "rpcsp"): Promise<CountReport> {
  const detail = await fetchCountSession(id, true);
  const classes = await classNameMap();
  const conditions = new Map<number, string>();
  const condJson = await get("/items/lgu_condition?fields=id,name&limit=-1");
  for (const row of (condJson.data ?? []) as Record<string, unknown>[]) {
    conditions.set(Number(row.id), text(row.name));
  }

  const groups = new Map<string, CountReportGroup>();
  let totalValue = 0;
  let totalShortageValue = 0;
  let missing = 0;
  let moved = 0;
  let found = 0;
  let notCounted = 0;
  let included = 0;

  for (const row of detail.lines) {
    const asset = row.asset;
    if (!asset) continue;
    const semi = asset.is_semi_expendable;
    // the report only covers the form it prints, so its figures must too
    if (form === "rpcppe" && semi) continue;
    if (form === "rpcsp" && !semi) continue;

    included += 1;
    if (row.line.found === null) {
      notCounted += 1;
      continue;
    }
    if (row.line.resolution === "missing") missing += 1;
    else if (row.line.resolution === "moved") moved += 1;
    else if (row.line.found) found += 1;

    const unitValue = asset.cost ?? 0;
    const onHandQty = row.line.found === true ? 1 : 0;
    const shortageQty = 1 - onHandQty;
    const shortageValue = Math.round(unitValue * shortageQty * 100) / 100;

    const reportRow: CountReportRow = {
      propertyNo: asset.property_no,
      article: asset.class_id ? classes.get(asset.class_id) ?? "Other" : "Other",
      description: asset.description,
      unit: asset.unit_of_measure || "pc",
      unitValue,
      dateAcquired: asset.acquisition_date,
      balanceQty: 1,
      onHandQty,
      shortageQty,
      shortageValue,
      remarks: lineRemark(row, row.line.condition_id ? conditions.get(row.line.condition_id) : undefined),
    };

    const key = reportRow.article;
    const group = groups.get(key) ?? { className: key, rows: [], totalQty: 0, totalValue: 0, totalShortageQty: 0, totalShortageValue: 0 };
    group.rows.push(reportRow);
    group.totalQty += onHandQty;
    group.totalValue = Math.round((group.totalValue + unitValue) * 100) / 100;
    group.totalShortageQty += shortageQty;
    group.totalShortageValue = Math.round((group.totalShortageValue + shortageValue) * 100) / 100;
    groups.set(key, group);

    totalValue = Math.round((totalValue + unitValue) * 100) / 100;
    totalShortageValue = Math.round((totalShortageValue + shortageValue) * 100) / 100;
  }

  return {
    form,
    session: detail.session,
    groups: Array.from(groups.values()).sort((a, b) => a.className.localeCompare(b.className)),
    summary: {
      totalLines: included,
      found,
      missing,
      moved,
      notCounted,
      totalValue,
      totalShortageValue,
    },
  };
}
