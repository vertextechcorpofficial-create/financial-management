import { enc, list } from "../../shared/api";
import { fetchLookups, mapAsset } from "../../assets/services/brgyAssets";
import type { BrgyAsset, BrgyCondition } from "../../types";
import { projectedTotal, projectedValue } from "../../types";

type Row = Record<string, unknown>;

export interface ReportAsset {
  asset: BrgyAsset;
  office: string;
  custodian: string;
  projected: number;
  total: number;
}

const ASSET_FIELDS =
  "id,asset_code,barangay_id,owner_type,name,classification_id,barcode,tag_no,security_tag,serial_no,office_id,custodian_id,date_acquired,cost,quantity,life_span_years,condition,status,photo,remarks,is_draft,cancelled,cancel_reason,source,created_by";

/** Section 4.8: the asset masterlist. */
export async function masterlist(barangayId: number): Promise<{ asOf: string; rows: ReportAsset[]; totalValue: number }> {
  const asOf = new Date().toISOString().slice(0, 10);
  const lookups = await fetchLookups(barangayId);
  const salvage = lookups.settings?.salvage_percent ?? 0;
  const offices = new Map(lookups.offices.map((o) => [o.id, o.name]));
  const custodians = new Map(lookups.custodians.map((c) => [c.id, c.full_name]));

  const res = await list<Row>(
    "/items/brgy_asset?filter=" +
      enc({ _and: [{ barangay_id: { _eq: barangayId } }, { cancelled: { _eq: false } }, { is_draft: { _eq: false } }, { status: { _neq: "Disposed" } }] }) +
      "&sort=asset_code&limit=-1&fields=" + ASSET_FIELDS
  );
  const rows = res.data.map(mapAsset).map((asset) => ({
    asset,
    office: asset.office_id ? offices.get(asset.office_id) ?? "" : "",
    custodian: asset.custodian_id ? custodians.get(asset.custodian_id) ?? "" : "",
    projected: projectedValue(asset, asOf, salvage),
    total: projectedTotal(asset, asOf, salvage),
  }));
  return { asOf, rows, totalValue: Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100 };
}

/** Section 4.8: the property accountability list, grouped by custodian, ready for signing. */
export async function accountability(barangayId: number): Promise<{ asOf: string; groups: { custodian: string; rows: ReportAsset[]; total: number }[] }> {
  const base = await masterlist(barangayId);
  const byCustodian = new Map<string, ReportAsset[]>();
  for (const row of base.rows) {
    const key = row.custodian || "Unassigned";
    if (!byCustodian.has(key)) byCustodian.set(key, []);
    byCustodian.get(key)!.push(row);
  }
  const groups = [...byCustodian.entries()]
    .map(([custodian, rows]) => ({ custodian, rows, total: Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100 }))
    .sort((a, b) => a.custodian.localeCompare(b.custodian));
  return { asOf: base.asOf, groups };
}

/** Section 4.8: the count summary for one closed or open count. */
export async function countSummary(countId: number): Promise<{
  year: number;
  status: string;
  found: number;
  notFound: number;
  notYetRecorded: number;
  conditionChanges: { assetCode: string; name: string; condition: BrgyCondition }[];
}> {
  const [countRows, lines] = await Promise.all([
    list<Row>("/items/brgy_count?filter=" + enc({ id: { _eq: countId } }) + "&limit=1"),
    list<Row>("/items/brgy_count_line?filter=" + enc({ count_id: { _eq: countId } }) + "&limit=-1"),
  ]);
  const count = countRows.data[0];
  if (!count) throw new Error("Count " + countId + " not found");
  const datas = lines.data;
  const assetIds = datas.map((l) => Number(l.asset_id)).filter((n) => Number.isFinite(n));
  const assets = assetIds.length
    ? (await list<Row>("/items/brgy_asset?filter=" + enc({ id: { _in: assetIds } }) + "&fields=id,asset_code,name&limit=-1")).data
    : [];
  const byId = new Map(assets.map((a) => [Number(a.id), a] as const));

  const changes = datas
    .filter((l) => l.condition)
    .map((l) => {
      const a = byId.get(Number(l.asset_id));
      return { assetCode: String(a?.asset_code ?? ""), name: String(a?.name ?? ""), condition: String(l.condition) as BrgyCondition };
    });

  return {
    year: Number(count.year ?? 0),
    status: String(count.status ?? "open"),
    found: datas.filter((l) => l.result === "found").length,
    notFound: datas.filter((l) => l.result === "not_found").length,
    notYetRecorded: datas.filter((l) => l.result === "not_yet_recorded").length,
    conditionChanges: changes,
  };
}

/** Section 4.8: municipal consolidation, totals per barangay. */
export async function consolidation(): Promise<{
  asOf: string;
  rows: { barangay: string; code: string; assets: number; cost: number; totalValue: number }[];
  totals: { assets: number; cost: number; totalValue: number };
}> {
  const asOf = new Date().toISOString().slice(0, 10);
  const lookups = await fetchLookups();
  const salvage = lookups.settings?.salvage_percent ?? 0;
  const res = await list<Row>(
    "/items/brgy_asset?filter=" + enc({ _and: [{ cancelled: { _eq: false } }, { is_draft: { _eq: false } }, { status: { _neq: "Disposed" } }] }) +
      "&limit=-1&fields=" + ASSET_FIELDS
  );
  const assets = res.data.map(mapAsset);
  const rows = lookups.barangays.map((b) => {
    const mine = assets.filter((a) => a.barangay_id === b.id);
    return {
      barangay: b.name,
      code: b.code,
      assets: mine.length,
      cost: Math.round(mine.reduce((s, a) => s + Number(a.cost ?? 0) * Math.max(1, a.quantity), 0) * 100) / 100,
      totalValue: Math.round(mine.reduce((s, a) => s + projectedTotal(a, asOf, salvage), 0) * 100) / 100,
    };
  });
  return {
    asOf,
    rows,
    totals: {
      assets: rows.reduce((s, r) => s + r.assets, 0),
      cost: Math.round(rows.reduce((s, r) => s + r.cost, 0) * 100) / 100,
      totalValue: Math.round(rows.reduce((s, r) => s + r.totalValue, 0) * 100) / 100,
    },
  };
}
