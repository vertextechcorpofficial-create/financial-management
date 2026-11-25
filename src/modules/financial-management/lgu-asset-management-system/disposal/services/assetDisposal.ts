import type {
  DisposalCandidate,
  DisposalInput,
  DisposalResponse,
  LguAsset,
  LguCondition,
  LguOffice,
} from "../../types";
import { bookValueAt } from "../../types";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

const FIELDS = "id,property_no,description,class_id,is_semi_expendable,cost,acquisition_date,available_for_use_date,life_months,residual_value,office_id,accountable_officer_name,location,condition_id,mode_of_acquisition,fund_source_id,donor_name,supplier,po_no,invoice_no,iar_no,par_no,ics_no,serial_no,brand,model,remarks,record_status,disposed_at,disposal_reason,book_value_at_disposal,unit_of_measure,is_bulk_child,bulk_batch_id,batch_total,rounding_remainder,voucher_no,status";

function auth(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: "Bearer " + (TOKEN ?? "") };
}
function url(path: string): string {
  if (!BASE) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  return BASE.replace(/\/+$/, "") + path;
}
function text(v: unknown): string { return typeof v === "string" ? v : ""; }
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function bool(v: unknown): boolean { return v === true || v === 1 || v === "1"; }

interface JsonResult { data?: unknown; meta?: { filter_count?: number } }

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
    accountable_officer_id: null,
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

const PAGE_SIZE = 50;

export async function fetchDisposalCandidates(params: { page?: number; q?: string }): Promise<DisposalResponse> {
  const page = Math.max(1, Number(params.page ?? 1));
  const and: Record<string, unknown>[] = [
    { status: { _eq: "active" } },
    { record_status: { _neq: "disposed" } },
    {
      _or: [
        { record_status: { _eq: "unserviceable" } },
        { record_status: { _eq: "missing" } },
        { condition_id: { _in: [3, 4] } },
      ],
    },
  ];
  if (params.q && params.q.trim()) {
    const n = params.q.trim();
    and.push({ _or: [{ property_no: { _icontains: n } }, { description: { _icontains: n } }] });
  }

  const filter = encodeURIComponent(JSON.stringify({ _and: and }));
  const [assetsJson, officesJson, conditionsJson] = await Promise.all([
    get("/items/lgu_asset?filter=" + filter + "&sort=property_no&limit=" + PAGE_SIZE + "&offset=" + (page - 1) * PAGE_SIZE + "&meta=filter_count&fields=" + FIELDS),
    get("/items/lgu_office?filter=" + encodeURIComponent(JSON.stringify({ status: { _eq: "active" } })) + "&sort=sort&limit=-1&fields=id,code,name,sort,status"),
    get("/items/lgu_condition?filter=" + encodeURIComponent(JSON.stringify({ status: { _eq: "active" } })) + "&sort=sort&limit=-1&fields=id,name,is_serviceable,sort,status"),
  ]);

  const assets = ((assetsJson.data ?? []) as Record<string, unknown>[]).map(mapAsset);
  const today = new Date().toISOString().slice(0, 10);

  const ids = assets.map((a) => a.id);
  const docJson = ids.length
    ? await get(
        "/items/lgu_asset_documents?filter=" +
          encodeURIComponent(JSON.stringify({ asset_id: { _in: ids }, doc_type: { _eq: "IIRUP" } })) +
          "&fields=asset_id,doc_no&limit=-1"
      )
    : { data: [] };
  const inspected = new Map<number, string>();
  for (const row of (docJson.data ?? []) as { asset_id?: number; doc_no?: string }[]) {
    if (row.asset_id) inspected.set(Number(row.asset_id), row.doc_no ?? "");
  }

  const candidates: DisposalCandidate[] = assets.map((asset) => ({
    asset,
    documents: inspected.has(asset.id) ? 1 : 0,
    hasIirup: inspected.has(asset.id),
    iirupNo: inspected.get(asset.id) ?? null,
    bookValue: bookValueAt(asset, today),
  }));

  return {
    candidates,
    total: Number(assetsJson.meta?.filter_count ?? candidates.length),
    page,
    pageSize: PAGE_SIZE,
    offices: ((officesJson.data ?? []) as Record<string, unknown>[]).map((o) => ({
      id: Number(o.id), code: text(o.code), name: text(o.name), sort: num(o.sort), status: text(o.status),
    })) as LguOffice[],
    conditions: ((conditionsJson.data ?? []) as Record<string, unknown>[]).map((c) => ({
      id: Number(c.id), name: text(c.name), is_serviceable: bool(c.is_serviceable), sort: num(c.sort), status: text(c.status),
    })) as LguCondition[],
  };
}

async function createDoc(input: { assetId: number; type: "IIRUP" | "PCV"; docNo: string; docDate: string; issuedTo: string | null; officeId: number | null; remarks: string | null }) {
  await post("/items/lgu_asset_documents", {
    asset_id: input.assetId,
    doc_type: input.type,
    doc_no: input.docNo,
    doc_date: input.docDate,
    issued_to: input.issuedTo,
    issued_to_office_id: input.officeId,
    remarks: input.remarks,
    status: "active",
  });
}

/**
 * Files the IIRUP. It records the disposal decision without removing the asset,
 * because the inspection report and the clearance voucher are two separate steps.
 */
export async function fileIirup(input: DisposalInput): Promise<DisposalResponse> {
  if (!input.docNo.trim()) throw new Error("The IIRUP number on the paper form is required");
  if (!input.reason.trim()) throw new Error("The reason for disposal is required");
  const assetJson = await get("/items/lgu_asset/" + input.assetId);
  if (!assetJson.data) throw new Error("Asset not found");
  const asset = mapAsset(assetJson.data as Record<string, unknown>);
  if (asset.record_status === "disposed") throw new Error("That asset is already disposed");

  const existing = await get(
    "/items/lgu_asset_documents?filter=" +
      encodeURIComponent(JSON.stringify({ asset_id: { _eq: asset.id }, doc_type: { _eq: "IIRUP" } })) +
      "&fields=id,doc_no&limit=1"
  );
  const already = ((existing.data ?? []) as { doc_no?: string }[])[0];
  if (already) {
    throw new Error("An IIRUP is already filed for this asset, " + (already.doc_no ?? "") + ". One inspection report per asset.");
  }

  await createDoc({
    assetId: asset.id,
    type: "IIRUP",
    docNo: input.docNo.trim(),
    docDate: input.docDate,
    issuedTo: asset.accountable_officer_name,
    officeId: asset.office_id,
    remarks: input.reason.trim() + (input.remarks ? " | " + input.remarks : ""),
  });

  await patch("/items/lgu_asset/" + asset.id, { record_status: "unserviceable" });
  return fetchDisposalCandidates({ page: 1 });
}

/**
 * Files the PCV and removes the asset from the register, freezing the carrying
 * value on the disposal date so the report can never drift.
 */
export async function disposeAsset(input: DisposalInput): Promise<DisposalResponse> {
  if (!input.docNo.trim()) throw new Error("The PCV number on the paper form is required");
  if (!input.reason.trim()) throw new Error("The reason for disposal is required");
  const assetJson = await get("/items/lgu_asset/" + input.assetId);
  if (!assetJson.data) throw new Error("Asset not found");
  const asset = mapAsset(assetJson.data as Record<string, unknown>);
  if (asset.record_status === "disposed") throw new Error("That asset is already disposed");

  const inspected = await get(
    "/items/lgu_asset_documents?filter=" +
      encodeURIComponent(JSON.stringify({ asset_id: { _eq: asset.id }, doc_type: { _eq: "IIRUP" } })) +
      "&fields=id&limit=1"
  );
  if (((inspected.data ?? []) as unknown[]).length === 0) {
    throw new Error("File the IIRUP first. The inspection report has to exist before the PCV can dispose anything.");
  }

  const bookValue = bookValueAt(asset, input.docDate);

  await createDoc({
    assetId: asset.id,
    type: "PCV",
    docNo: input.docNo.trim(),
    docDate: input.docDate,
    issuedTo: asset.accountable_officer_name,
    officeId: asset.office_id,
    remarks: input.reason.trim() + (input.remarks ? " | " + input.remarks : ""),
  });

  await post("/items/lgu_asset_movements", {
    asset_id: asset.id,
    movement: "dispose",
    movement_date: input.docDate,
    from_office_id: asset.office_id,
    to_office_id: null,
    from_officer: asset.accountable_officer_name,
    to_officer: null,
    document_id: null,
    remarks: "Disposed under PCV " + input.docNo.trim() + ": " + input.reason.trim(),
    created_by: input.encoder ?? null,
    status: "active",
  });

  await patch("/items/lgu_asset/" + asset.id, {
    record_status: "disposed",
    disposed_at: input.docDate,
    disposal_reason: input.reason.trim(),
    book_value_at_disposal: bookValue,
    accountable_officer_name: null,
  });

  return fetchDisposalCandidates({ page: 1 });
}
