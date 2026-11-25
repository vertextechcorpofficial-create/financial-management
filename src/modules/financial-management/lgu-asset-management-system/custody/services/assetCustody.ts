import type {
  AssetHistory,
  CustodyResponse,
  CustodyReturnInput,
  CustodyRow,
  CustodyTransferInput,
  DocType,
  LguAsset,
  LguAssetDocument,
  LguAssetMovement,
  LguOffice,
  MovementType,
} from "../../types";
import { custodyFormFor } from "../../types";

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

async function post(collection: string, payload: Record<string, unknown>): Promise<JsonResult> {
  const res = await fetch(url("/items/" + collection), {
    method: "POST",
    headers: auth(),
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error("POST " + collection + " " + res.status + ": " + body.slice(0, 250));
  return JSON.parse(body) as JsonResult;
}

async function patch(collection: string, id: number, payload: Record<string, unknown>): Promise<JsonResult> {
  const res = await fetch(url("/items/" + collection + "/" + id), {
    method: "PATCH",
    headers: auth(),
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error("PATCH " + collection + " " + res.status + ": " + body.slice(0, 250));
  return JSON.parse(body) as JsonResult;
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

function mapDocument(row: Record<string, unknown>): LguAssetDocument {
  return {
    id: Number(row.id),
    asset_id: Number(row.asset_id),
    doc_type: (text(row.doc_type) || "PAR") as DocType,
    doc_no: text(row.doc_no),
    doc_date: (row.doc_date as string) ?? null,
    issued_to: (row.issued_to as string) ?? null,
    issued_to_office_id: num(row.issued_to_office_id),
    remarks: (row.remarks as string) ?? null,
    status: text(row.status) || "active",
  };
}

function mapMovement(row: Record<string, unknown>): LguAssetMovement {
  return {
    id: Number(row.id),
    asset_id: Number(row.asset_id),
    movement: (text(row.movement) || "issue") as MovementType,
    movement_date: (row.movement_date as string) ?? null,
    from_office_id: num(row.from_office_id),
    to_office_id: num(row.to_office_id),
    from_officer: (row.from_officer as string) ?? null,
    to_officer: (row.to_officer as string) ?? null,
    document_id: num(row.document_id),
    remarks: (row.remarks as string) ?? null,
    created_by: (row.created_by as string) ?? null,
    status: text(row.status) || "active",
  };
}

async function fetchOffices(): Promise<LguOffice[]> {
  const filter = encodeURIComponent(JSON.stringify({ status: { _eq: "active" } }));
  const json = await get("/items/lgu_office?filter=" + filter + "&sort=sort&limit=-1&fields=id,code,name,sort,status");
  return ((json.data ?? []) as Record<string, unknown>[]).map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    code: text(r.code),
    name: text(r.name),
    sort: num(r.sort),
    status: text(r.status),
  }));
}

/** Autocomplete source: names already used on assets and on past movements. */
async function fetchOfficerNames(): Promise<string[]> {
  const [fromAssets, fromMovements] = await Promise.all([
    get("/items/lgu_asset?filter=" + encodeURIComponent(JSON.stringify({ accountable_officer_name: { _nnull: true } })) + "&limit=500&fields=accountable_officer_name"),
    get("/items/lgu_asset_movements?sort=-movement_date&limit=500&fields=to_officer"),
  ]);
  const names = new Set<string>();
  for (const r of (fromAssets.data ?? []) as Record<string, unknown>[]) {
    const n = text(r.accountable_officer_name).trim();
    if (n) names.add(n);
  }
  for (const r of (fromMovements.data ?? []) as Record<string, unknown>[]) {
    const n = text(r.to_officer).trim();
    if (n) names.add(n);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

const CUSTODY_PAGE_SIZE = 50;

let prefixCache: { at: number; data: string[] } | null = null;

/** Property prefixes come from the asset classes, cached for a minute. */
async function fetchPrefixes(): Promise<string[]> {
  const now = Date.now();
  if (prefixCache && now - prefixCache.at < 60_000) return prefixCache.data;
  const json = await get("/items/lgu_asset_class?filter=" + encodeURIComponent(JSON.stringify({ status: { _eq: "active" } })) + "&fields=property_prefix&limit=-1");
  const seen = new Set<string>();
  for (const row of (json.data ?? []) as Record<string, unknown>[]) {
    const p = typeof row.property_prefix === "string" ? row.property_prefix.trim() : "";
    if (p) seen.add(p);
  }
  const data = Array.from(seen).sort();
  prefixCache = { at: now, data };
  return data;
}

export type CustodySortKey = "property_no" | "is_semi_expendable" | "accountable_officer_name";

const SORTABLE: Record<CustodySortKey, string> = {
  property_no: "property_no",
  is_semi_expendable: "is_semi_expendable",
  accountable_officer_name: "accountable_officer_name",
};

export type CustodyFormFilter = "par" | "ics" | null;

export async function fetchCustodyList(params: {
  q?: string;
  officeId?: number | null;
  onlyWithOfficer?: boolean;
  form?: string | null;
  officer?: string | null;
  prefix?: string | null;
  page?: number;
  sort?: string;
  dir?: string;
}): Promise<CustodyResponse> {
  const and: Record<string, unknown>[] = [{ status: { _eq: "active" } }];
  if (params.q && params.q.trim()) {
    const n = params.q.trim();
    and.push({
      _or: [
        { property_no: { _icontains: n } },
        { description: { _icontains: n } },
        { accountable_officer_name: { _icontains: n } },
      ],
    });
  }
  if (params.officeId) and.push({ office_id: { _eq: params.officeId } });
  if (params.onlyWithOfficer) and.push({ accountable_officer_name: { _nnull: true } });

  // PAR is PPE, ICS is semi-expendable, so the form filter is the classification flag
  if (params.form === "par") and.push({ is_semi_expendable: { _eq: false } });
  if (params.form === "ics") and.push({ is_semi_expendable: { _eq: true } });

  if (params.officer === "__none") and.push({ accountable_officer_name: { _null: true } });
  else if (params.officer) and.push({ accountable_officer_name: { _eq: params.officer } });

  if (params.prefix) and.push({ property_no: { _starts_with: params.prefix + "-" } });

  const page = Math.max(1, Number(params.page ?? 1));
  const filter = encodeURIComponent(JSON.stringify({ _and: and }));

  // one page of assets, nothing else
  const sortKey = (params.sort && (params.sort in SORTABLE) ? params.sort : "property_no") as CustodySortKey;
  const sortDir = params.dir === "desc" ? "-" : "";
  const sortParam = sortDir + SORTABLE[sortKey];

  const assetsJson = await get(
    "/items/lgu_asset?filter=" + filter +
    "&sort=" + sortParam + ",property_no&limit=" + CUSTODY_PAGE_SIZE +
    "&offset=" + (page - 1) * CUSTODY_PAGE_SIZE +
    "&meta=filter_count" +
    "&fields=id,property_no,description,class_id,is_semi_expendable,cost,office_id,accountable_officer_name,condition_id,record_status,status,location,unit_of_measure"
  );
  const assetRows = ((assetsJson.data ?? []) as Record<string, unknown>[]).map(mapAsset);
  const total = Number(assetsJson.meta?.filter_count ?? assetRows.length);

  const [offices, officers, prefixes] = await Promise.all([fetchOffices(), fetchOfficerNames(), fetchPrefixes()]);

  if (assetRows.length === 0) {
    return { rows: [], total, page, pageSize: CUSTODY_PAGE_SIZE, officers, offices, prefixes };
  }

  const ids = assetRows.map((a) => a.id);
  const idFilter = encodeURIComponent(JSON.stringify({ asset_id: { _in: ids } }));

  // two bounded queries instead of two full table scans
  const [documentsJson, movementsJson] = await Promise.all([
    get("/items/lgu_asset_documents?filter=" + idFilter + "&aggregate[count]=id&groupBy[]=asset_id"),
    get("/items/lgu_asset_movements?filter=" + idFilter + "&sort=-movement_date&fields=asset_id,movement_date&limit=" + ids.length * 5),
  ]);

  const docCount = new Map<number, number>();
  for (const d of (documentsJson.data ?? []) as Record<string, unknown>[]) {
    const countWrapper = d.count as Record<string, unknown> | undefined;
    docCount.set(Number(d.asset_id), Number(countWrapper?.id ?? 0));
  }

  const lastDate = new Map<number, string>();
  for (const m of (movementsJson.data ?? []) as Record<string, unknown>[]) {
    const id = Number(m.asset_id);
    if (lastDate.has(id)) continue;
    const date = (m.movement_date as string) ?? "";
    if (date) lastDate.set(id, date);
  }

  const rows: CustodyRow[] = assetRows.map((asset) => ({
    asset,
    lastMovementDate: lastDate.get(asset.id) ?? null,
    documentCount: docCount.get(asset.id) ?? 0,
  }));

  return { rows, total, page, pageSize: CUSTODY_PAGE_SIZE, officers, offices, prefixes };
}

export async function fetchHistory(assetId: number): Promise<AssetHistory> {
  const [assetJson, docJson, movJson] = await Promise.all([
    get("/items/lgu_asset/" + assetId),
    get("/items/lgu_asset_documents?filter=" + encodeURIComponent(JSON.stringify({ asset_id: { _eq: assetId } })) + "&sort=-doc_date&limit=-1"),
    get("/items/lgu_asset_movements?filter=" + encodeURIComponent(JSON.stringify({ asset_id: { _eq: assetId } })) + "&sort=-movement_date,-id&limit=-1"),
  ]);
  if (!assetJson.data) throw new Error("Asset " + assetId + " not found");
  return {
    asset: mapAsset(assetJson.data as Record<string, unknown>),
    documents: ((docJson.data ?? []) as Record<string, unknown>[]).map(mapDocument),
    movements: ((movJson.data ?? []) as Record<string, unknown>[]).map(mapMovement),
  };
}

async function createDocument(input: {
  assetId: number;
  docType: DocType;
  docNo: string;
  docDate: string;
  issuedTo: string;
  officeId: number | null;
  remarks?: string | null;
}): Promise<LguAssetDocument> {
  const json = await post("lgu_asset_documents", {
    asset_id: input.assetId,
    doc_type: input.docType,
    doc_no: input.docNo,
    doc_date: input.docDate,
    issued_to: input.issuedTo,
    issued_to_office_id: input.officeId,
    remarks: input.remarks ?? null,
    status: "active",
  });
  return mapDocument(json.data as Record<string, unknown>);
}

async function createMovement(input: {
  assetId: number;
  movement: MovementType;
  date: string;
  fromOfficeId: number | null;
  toOfficeId: number | null;
  fromOfficer: string | null;
  toOfficer: string | null;
  documentId: number | null;
  remarks?: string | null;
  encoder?: string | null;
}): Promise<LguAssetMovement> {
  const json = await post("lgu_asset_movements", {
    asset_id: input.assetId,
    movement: input.movement,
    movement_date: input.date,
    from_office_id: input.fromOfficeId,
    to_office_id: input.toOfficeId,
    from_officer: input.fromOfficer,
    to_officer: input.toOfficer,
    document_id: input.documentId,
    remarks: input.remarks ?? null,
    created_by: input.encoder ?? null,
    status: "active",
  });
  return mapMovement(json.data as Record<string, unknown>);
}

async function loadAsset(assetId: number): Promise<LguAsset> {
  const json = await get("/items/lgu_asset/" + assetId);
  if (!json.data) throw new Error("Asset " + assetId + " not found");
  return mapAsset(json.data as Record<string, unknown>);
}

export async function issueAsset(input: CustodyTransferInput): Promise<AssetHistory> {
  const asset = await loadAsset(input.assetId);
  if (asset.status !== "active") throw new Error("Asset is retired and cannot be issued");

  const officer = (input.toOfficer ?? "").trim();
  const docNo = (input.docNo ?? "").trim();
  // an issue with no name would quietly clear whoever was accountable for it
  if (!officer) throw new Error("The name of the officer receiving the PAR or ICS is required");
  if (!docNo) throw new Error("The PAR or ICS number on the paper form is required");

  const docType = custodyFormFor(asset);
  const document = await createDocument({
    assetId: asset.id,
    docType,
    docNo,
    docDate: input.docDate,
    issuedTo: officer,
    officeId: input.toOfficeId,
    remarks: input.remarks ?? null,
  });

  await createMovement({
    assetId: asset.id,
    movement: "issue",
    date: input.docDate,
    fromOfficeId: asset.office_id,
    toOfficeId: input.toOfficeId,
    fromOfficer: asset.accountable_officer_name,
    toOfficer: officer,
    documentId: document.id,
    remarks: input.remarks ?? null,
    encoder: input.encoder ?? null,
  });

  await patch("lgu_asset", asset.id, {
    accountable_officer_name: officer,
    office_id: input.toOfficeId,
    record_status: "active",
  });

  return fetchHistory(asset.id);
}

export async function transferAsset(input: CustodyTransferInput): Promise<AssetHistory> {
  const asset = await loadAsset(input.assetId);
  if (asset.status !== "active") throw new Error("Asset is retired and cannot be transferred");
  if (!(input.toOfficer ?? "").trim()) throw new Error("The receiving officer is required");
  if (!(input.docNo ?? "").trim()) throw new Error("The PAR or ICS number on the paper form is required");

  const docType = custodyFormFor(asset);
  const document = await createDocument({
    assetId: asset.id,
    docType,
    docNo: input.docNo.trim(),
    docDate: input.docDate,
    issuedTo: input.toOfficer.trim(),
    officeId: input.toOfficeId,
    remarks: input.remarks ?? null,
  });

  await createMovement({
    assetId: asset.id,
    movement: "transfer",
    date: input.docDate,
    fromOfficeId: asset.office_id,
    toOfficeId: input.toOfficeId,
    fromOfficer: asset.accountable_officer_name,
    toOfficer: input.toOfficer.trim(),
    documentId: document.id,
    remarks: input.remarks ?? null,
    encoder: input.encoder ?? null,
  });

  await patch("lgu_asset", asset.id, {
    accountable_officer_name: input.toOfficer.trim(),
    office_id: input.toOfficeId,
    record_status: "transferred",
  });

  return fetchHistory(asset.id);
}

export async function returnAsset(input: CustodyReturnInput): Promise<AssetHistory> {
  const asset = await loadAsset(input.assetId);
  if (asset.status !== "active") throw new Error("Asset is retired");

  await createMovement({
    assetId: asset.id,
    movement: "return",
    date: new Date().toISOString().slice(0, 10),
    fromOfficeId: asset.office_id,
    toOfficeId: asset.office_id,
    fromOfficer: asset.accountable_officer_name,
    toOfficer: null,
    documentId: null,
    remarks: input.remarks ?? null,
    encoder: input.encoder ?? null,
  });

  await patch("lgu_asset", asset.id, {
    accountable_officer_name: null,
    record_status: "active",
  });

  return fetchHistory(asset.id);
}
