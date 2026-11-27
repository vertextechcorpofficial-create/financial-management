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
import { forget, memo } from "../../shared/cache";

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
    attachment: (row.attachment as string) ?? null,
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
  return memo<LguOffice[]>("lgu:offices", 5 * 60_000, loadOffices);
}

async function loadOffices(): Promise<LguOffice[]> {
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
  // two 500 row reads on every custody load, so they are remembered for a minute and the
  // custody actions drop them
  return memo<string[]>("lgu:officers", 60_000, loadOfficerNames);
}

async function loadOfficerNames(): Promise<string[]> {
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

/** Property prefixes come from the asset classes, cached for five minutes. */
async function fetchPrefixes(): Promise<string[]> {
  return memo<string[]>("lgu:prefixes", 5 * 60_000, async () => {
    const json = await get("/items/lgu_asset_class?filter=" + encodeURIComponent(JSON.stringify({ status: { _eq: "active" } })) + "&fields=property_prefix&limit=-1");
    const seen = new Set<string>();
    for (const row of (json.data ?? []) as Record<string, unknown>[]) {
      const p = typeof row.property_prefix === "string" ? row.property_prefix.trim() : "";
      if (p) seen.add(p);
    }
    return Array.from(seen).sort();
  });
}


export type CustodySortKey = "property_no" | "is_semi_expendable" | "accountable_officer_name";

const SORTABLE: Record<CustodySortKey, string> = {
  property_no: "property_no",
  is_semi_expendable: "is_semi_expendable",
  accountable_officer_name: "accountable_officer_name",
};

export type CustodyFormFilter = "par" | "ics" | null;

interface CustodyQuery {
  q?: string;
  officeId?: number | null;
  onlyWithOfficer?: boolean;
  form?: string | null;
  officer?: string | null;
  prefix?: string | null;
  page?: number;
  sort?: string;
  dir?: string;
}

function custodyFilter(params: CustodyQuery): Record<string, unknown>[] {
  const and: Record<string, unknown>[] = [
    { status: { _eq: "active" } },
    // a disposed asset has left the books and has no custodian to show here
    { record_status: { _neq: "disposed" } },
  ];
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
  return and;
}

/** Every row that matches the filters, with its document count and last movement. */
export async function exportCustodyRows(params: CustodyQuery): Promise<{
  rows: { asset: LguAsset; documents: number; lastMovement: string | null }[];
  offices: LguOffice[];
}> {
  const filter = encodeURIComponent(JSON.stringify({ _and: custodyFilter(params) }));
  const assetsJson = await get(
    "/items/lgu_asset?filter=" + filter +
    "&sort=property_no&limit=-1" +
    "&fields=id,property_no,description,class_id,is_semi_expendable,cost,office_id,accountable_officer_name,condition_id,record_status,status,location,unit_of_measure"
  );
  const assets = ((assetsJson.data ?? []) as Record<string, unknown>[]).map(mapAsset);
  const offices = await fetchOffices();
  if (assets.length === 0) return { rows: [], offices };

  const ids = assets.map((a) => a.id);
  const idFilter = encodeURIComponent(JSON.stringify({ asset_id: { _in: ids } }));
  const [documentsJson, movementsJson] = await Promise.all([
    get("/items/lgu_asset_documents?filter=" + idFilter + "&aggregate[count]=id&groupBy[]=asset_id&limit=-1"),
    get("/items/lgu_asset_movements?filter=" + idFilter + "&sort=-movement_date&fields=asset_id,movement_date&limit=-1"),
  ]);

  const docCount = new Map<number, number>();
  for (const d of (documentsJson.data ?? []) as Record<string, unknown>[]) {
    docCount.set(Number(d.asset_id), Number((d.count as Record<string, unknown> | undefined)?.id ?? 0));
  }
  const lastDate = new Map<number, string>();
  for (const m of (movementsJson.data ?? []) as Record<string, unknown>[]) {
    const id = Number(m.asset_id);
    const date = (m.movement_date as string) ?? "";
    if (!lastDate.has(id) && date) lastDate.set(id, date);
  }

  return {
    rows: assets.map((asset) => ({
      asset,
      documents: docCount.get(asset.id) ?? 0,
      lastMovement: lastDate.get(asset.id) ?? null,
    })),
    offices,
  };
}

export async function fetchCustodyList(params: CustodyQuery): Promise<CustodyResponse> {
  const and = custodyFilter(params);
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
  const asset = mapAsset(assetJson.data as Record<string, unknown>);

  // names for the printed form, so a paper never shows a numeric id
  const [classJson, conditionJson] = await Promise.all([
    asset.class_id ? get("/items/lgu_asset_class/" + asset.class_id + "?fields=name") : Promise.resolve({ data: null }),
    asset.condition_id ? get("/items/lgu_condition/" + asset.condition_id + "?fields=name") : Promise.resolve({ data: null }),
  ]);

  return {
    asset,
    documents: ((docJson.data ?? []) as Record<string, unknown>[]).map(mapDocument),
    movements: ((movJson.data ?? []) as Record<string, unknown>[]).map(mapMovement),
    className: text((classJson.data as Record<string, unknown> | null)?.name) || null,
    conditionName: text((conditionJson.data as Record<string, unknown> | null)?.name) || null,
  };
}

/** Uploads the signed paper and points the document at it. Returns the stored file id. */
export async function attachDocumentScan(documentId: number, file: File): Promise<{ fileId: string }> {
  const doc = await get("/items/lgu_asset_documents/" + documentId);
  if (!doc.data) throw new Error("Document " + documentId + " not found");

  const form = new FormData();
  form.append("file", file, file.name || "scan");
  const upload = await fetch(url("/files"), {
    method: "POST",
    headers: { Authorization: "Bearer " + (TOKEN ?? "") },
    body: form,
  });
  const uploaded = (await upload.json().catch(() => null)) as { data?: { id?: string }; errors?: { message?: string }[] } | null;
  if (!upload.ok || !uploaded?.data?.id) {
    throw new Error(uploaded?.errors?.[0]?.message ?? "The file could not be uploaded");
  }

  const fileId = uploaded.data.id;
  const patchRes = await fetch(url("/items/lgu_asset_documents/" + documentId), {
    method: "PATCH",
    headers: auth(),
    body: JSON.stringify({ attachment: fileId }),
  });
  if (!patchRes.ok) throw new Error("The scan uploaded but the document could not be updated");

  return { fileId };
}

/** Streams the stored scan back, so the browser never sees the Directus token. */
export async function readDocumentScan(fileId: string): Promise<Response> {
  const res = await fetch(url("/assets/" + encodeURIComponent(fileId)), {
    headers: { Authorization: "Bearer " + (TOKEN ?? "") },
    cache: "no-store",
  });
  if (!res.ok) throw new Error("That scan is not available");
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=60",
    },
  });
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
  // a move adds an officer name and a movement row, so the remembered lists are dropped
  forget("lgu:officers");
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
  // a move adds an officer name and a movement row, so the remembered lists are dropped
  forget("lgu:officers");
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
  // a move adds an officer name and a movement row, so the remembered lists are dropped
  forget("lgu:officers");
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
