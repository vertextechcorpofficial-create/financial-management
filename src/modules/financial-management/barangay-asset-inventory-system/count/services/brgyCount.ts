import { enc, get, list, num, patch, post, text } from "../../shared/api";
import { mapAsset } from "../../assets/services/brgyAssets";
import type { BrgyAsset, BrgyCondition, BrgyCount, BrgyCountLine } from "../../types";

type Row = Record<string, unknown>;

function mapCount(r: Row): BrgyCount {
  return {
    id: Number(r.id), barangay_id: Number(r.barangay_id), year: Number(r.year ?? 0),
    status: (text(r.status) === "closed" ? "closed" : "open"),
    opened_by: (r.opened_by as string) ?? null, closed_by: (r.closed_by as string) ?? null,
    remarks: (r.remarks as string) ?? null,
  };
}

function mapLine(r: Row): BrgyCountLine {
  return {
    id: Number(r.id), count_id: Number(r.count_id), asset_id: num(r.asset_id),
    result: (text(r.result) || "found") as BrgyCountLine["result"],
    condition: (text(r.condition) || null) as BrgyCondition | null,
    remarks: (r.remarks as string) ?? null, marked_by: (r.marked_by as string) ?? null,
    pending_asset_name: (r.pending_asset_name as string) ?? null,
  };
}

export async function listCounts(barangayId: number): Promise<BrgyCount[]> {
  const res = await list<Row>("/items/brgy_count?filter=" + enc({ barangay_id: { _eq: barangayId } }) + "&sort=-year&limit=-1");
  return res.data.map(mapCount);
}

/** Section 4.7: only one count can be open per barangay at a time. */
export async function openCount(input: { barangayId: number; year: number; actor?: string | null; remarks?: string | null }): Promise<BrgyCount> {
  const open = await list<Row>("/items/brgy_count?filter=" + enc({ _and: [{ barangay_id: { _eq: input.barangayId } }, { status: { _eq: "open" } }] }) + "&limit=1");
  if (open.data.length) throw new Error("A count for this barangay is already open. Close it before opening a new one.");
  const created = await post<Row>("/items/brgy_count", {
    barangay_id: input.barangayId,
    year: input.year,
    status: "open",
    opened_by: input.actor ?? null,
    remarks: input.remarks ?? null,
  });
  return mapCount(created);
}

export interface CountDetail {
  count: BrgyCount;
  lines: BrgyCountLine[];
  expected: { line: BrgyCountLine; asset: BrgyAsset | null }[];
  summary: { expected: number; found: number; notFound: number; notYetRecorded: number; pending: number };
  closed: boolean;
}

export async function fetchCount(countId: number): Promise<CountDetail> {
  const countRows = await get<Row[]>("/items/brgy_count?filter=" + enc({ id: { _eq: countId } }) + "&limit=1");
  if (!countRows?.length) throw new Error("Count " + countId + " not found");
  const count = mapCount(countRows[0]);

  const [lineRows, assetRows] = await Promise.all([
    list<Row>("/items/brgy_count_line?filter=" + enc({ count_id: { _eq: countId } }) + "&sort=id&limit=-1"),
    list<Row>(
      "/items/brgy_asset?filter=" +
        enc({ _and: [{ barangay_id: { _eq: count.barangay_id } }, { cancelled: { _eq: false } }, { is_draft: { _eq: false } }] }) +
        "&sort=asset_code&limit=-1&fields=id,asset_code,barangay_id,owner_type,name,classification_id,item_type_id,barcode,tag_no,security_tag,serial_no,office_id,custodian_id,date_acquired,cost,quantity,life_span_years,condition,status,photo,remarks,is_draft,cancelled,cancel_reason,source,created_by"
    ),
  ]);

  const lines = lineRows.data.map(mapLine);
  const assets = assetRows.data.map(mapAsset);
  const byAsset = new Map<number, BrgyCountLine>();
  for (const line of lines) if (line.asset_id) byAsset.set(line.asset_id, line);

  const expected = assets
    // section 4.10: an asset in For Return cannot be assigned, edited or counted
    .filter((a) => a.status !== "Disposed" && a.status !== "For Receiving" && a.status !== "For Return")
    .map((asset) => ({ line: byAsset.get(asset.id) ?? { id: 0, count_id: countId, asset_id: asset.id, result: "found" as const, condition: null, remarks: null, marked_by: null, pending_asset_name: null }, asset }));

  const marked = lines.filter((l) => l.asset_id);
  const found = marked.filter((l) => l.result === "found").length;
  const notFound = marked.filter((l) => l.result === "not_found").length;
  const notYet = lines.filter((l) => !l.asset_id).length;

  return {
    count,
    lines,
    expected,
    summary: { expected: expected.length, found, notFound, notYetRecorded: notYet, pending: expected.length - marked.length },
    closed: count.status === "closed",
  };
}

/** Section 4.7: mark each asset found or not found, with its condition. */
export async function markCountLine(input: {
  countId: number;
  assetId: number;
  result: "found" | "not_found";
  condition?: BrgyCondition | null;
  remarks?: string | null;
  actor?: string | null;
}): Promise<CountDetail> {
  const detail = await fetchCount(input.countId);
  if (detail.closed) throw new Error("This count is closed and can no longer be edited.");

  const existing = detail.lines.find((l) => l.asset_id === input.assetId);
  const body = {
    count_id: input.countId,
    asset_id: input.assetId,
    result: input.result,
    condition: input.condition ?? null,
    remarks: input.remarks ?? null,
    marked_by: input.actor ?? null,
  };
  if (existing) await patch("/items/brgy_count_line/" + existing.id, body);
  else await post("/items/brgy_count_line", body);

  if (input.condition) await patch("/items/brgy_asset/" + input.assetId, { condition: input.condition });
  return fetchCount(input.countId);
}

/** Section 4.7: an item found that is not on the list is noted as Not Yet Recorded. */
export async function markUnrecorded(input: {
  countId: number;
  name: string;
  remarks?: string | null;
  actor?: string | null;
}): Promise<CountDetail> {
  const detail = await fetchCount(input.countId);
  if (detail.closed) throw new Error("This count is closed and can no longer be edited.");
  if (!input.name || !input.name.trim()) throw new Error("Name the item that was found but is not on the list");
  await post("/items/brgy_count_line", {
    count_id: input.countId,
    asset_id: null,
    result: "not_yet_recorded",
    remarks: input.remarks ?? null,
    marked_by: input.actor ?? null,
    pending_asset_name: input.name.trim(),
  });
  return fetchCount(input.countId);
}

/**
 * Section 4.7: closing produces the summary, and Not Found items are then handled
 * as in 4.6, meaning they become Missing with a written reason. The close is final.
 */
export async function closeCount(input: { countId: number; actor?: string | null }): Promise<CountDetail> {
  const detail = await fetchCount(input.countId);
  if (detail.closed) throw new Error("This count is closed and can no longer be edited.");
  if (detail.summary.pending > 0) {
    throw new Error("Mark the remaining " + detail.summary.pending + " asset(s) before closing the count");
  }
  for (const line of detail.lines) {
    if (!line.asset_id || line.result !== "not_found") continue;
    await patch("/items/brgy_asset/" + line.asset_id, { status: "Missing" });
    await post("/items/brgy_asset_history", {
      asset_id: line.asset_id,
      action: "status",
      from_value: "Active",
      to_value: "Missing",
      remarks: "Not found during the " + detail.count.year + " physical count",
      actor: input.actor ?? null,
    });
  }
  await patch("/items/brgy_count/" + input.countId, {
    status: "closed",
    closed_by: input.actor ?? null,
    closed_at: new Date().toISOString(),
  });
  return fetchCount(input.countId);
}
