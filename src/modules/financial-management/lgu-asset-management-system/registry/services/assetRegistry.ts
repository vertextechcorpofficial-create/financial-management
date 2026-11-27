import type {
  AssetRecordStatus,
  AssetRegistryQuery,
  AssetSortKey,
  BulkAssetInput,
  BulkCreateResult,
  LguAsset,
  LguAssetInput,
  RegistryLookups,
} from "../../types";
import { ASSET_SORT_FIELDS, computeResidual, isSemiExpendable, splitBatchTotal } from "../../types";
import { forget, memo } from "../../shared/cache";

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN;

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: "Bearer " + (TOKEN ?? ""),
  };
}

function itemsUrl(collection: string): string {
  if (!BASE) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");
  return BASE.replace(/\/+$/, "") + "/items/" + collection;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Directus returns decimals as strings, normalise to numbers once, here. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function mapAsset(row: Record<string, unknown>): LguAsset {
  return {
    id: Number(row.id),
    property_no: text(row.property_no),
    description: text(row.description),
    class_id: toNumber(row.class_id),
    is_semi_expendable: toBool(row.is_semi_expendable),
    cost: toNumber(row.cost),
    acquisition_date: (row.acquisition_date as string) ?? null,
    available_for_use_date: (row.available_for_use_date as string) ?? null,
    life_months: toNumber(row.life_months),
    residual_value: toNumber(row.residual_value),
    office_id: toNumber(row.office_id),
    accountable_officer_id: toNumber(row.accountable_officer_id),
    accountable_officer_name: (row.accountable_officer_name as string) ?? null,
    location: (row.location as string) ?? null,
    condition_id: toNumber(row.condition_id),
    mode_of_acquisition: ((row.mode_of_acquisition as string) ?? "purchase") as LguAsset["mode_of_acquisition"],
    fund_source_id: toNumber(row.fund_source_id),
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
    record_status: ((row.record_status as string) ?? "active") as AssetRecordStatus,
    disposed_at: (row.disposed_at as string) ?? null,
    disposal_reason: (row.disposal_reason as string) ?? null,
    book_value_at_disposal: toNumber(row.book_value_at_disposal),
    unit_of_measure: text(row.unit_of_measure) || "pc",
    is_bulk_child: toBool(row.is_bulk_child),
    bulk_batch_id: (row.bulk_batch_id as string) ?? null,
    batch_total: toNumber(row.batch_total),
    rounding_remainder: toNumber(row.rounding_remainder),
    voucher_no: (row.voucher_no as string) ?? null,
    status: text(row.status) || "active",
  };
}

async function directusGet(path: string): Promise<unknown> {
  const res = await fetch(BASE!.replace(/\/+$/, "") + path, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error("Directus GET failed " + res.status + ": " + body.slice(0, 300));
  }
  return res.json();
}

export async function fetchLookups(): Promise<RegistryLookups> {
  // five minutes: classes, offices, fund sources and conditions are edited from the admin
  // screen only, and every screen needs them to show a name instead of an id
  return memo<RegistryLookups>("lgu:lookups", 5 * 60_000, loadLookups);
}

async function loadLookups(): Promise<RegistryLookups> {
  const active = JSON.stringify({ status: { _eq: "active" } });
  const q = "?filter=" + encodeURIComponent(active) + "&sort=sort&limit=-1";

  const [classes, offices, fundSources, conditions] = await Promise.all([
    directusGet("/items/lgu_asset_class" + q) as Promise<{ data: Record<string, unknown>[] }>,
    directusGet("/items/lgu_office" + q) as Promise<{ data: Record<string, unknown>[] }>,
    directusGet("/items/lgu_fund_source" + q) as Promise<{ data: Record<string, unknown>[] }>,
    directusGet("/items/lgu_condition" + q) as Promise<{ data: Record<string, unknown>[] }>,
  ]);

  return {
    classes: (classes.data ?? []).map((r) => ({
      id: Number(r.id),
      code: text(r.code),
      name: text(r.name),
      property_prefix: text(r.property_prefix),
      default_life_months: toNumber(r.default_life_months),
      depreciable: toBool(r.depreciable),
      sort: toNumber(r.sort),
      status: text(r.status),
    })),
    offices: (offices.data ?? []).map((r) => ({
      id: Number(r.id),
      code: text(r.code),
      name: text(r.name),
      sort: toNumber(r.sort),
      status: text(r.status),
    })),
    fundSources: (fundSources.data ?? []).map((r) => ({
      id: Number(r.id),
      code: text(r.code),
      name: text(r.name),
      sort: toNumber(r.sort),
      status: text(r.status),
    })),
    conditions: (conditions.data ?? []).map((r) => ({
      id: Number(r.id),
      name: text(r.name),
      is_serviceable: toBool(r.is_serviceable),
      sort: toNumber(r.sort),
      status: text(r.status),
    })),
  };
}

export interface RegistryStatusCounts {
  [status: string]: number;
}

function assetFilter(query: AssetRegistryQuery): Record<string, unknown>[] {
  const and: Record<string, unknown>[] = [];
  if (query.q && query.q.trim()) {
    const needle = query.q.trim();
    and.push({
      _or: [
        { property_no: { _icontains: needle } },
        { description: { _icontains: needle } },
        { serial_no: { _icontains: needle } },
        { accountable_officer_name: { _icontains: needle } },
      ],
    });
  }
  if (query.classId) and.push({ class_id: { _eq: query.classId } });
  if (query.officeId) and.push({ office_id: { _eq: query.officeId } });
  if (query.recordStatus !== "all") {
    and.push({ record_status: { _eq: query.recordStatus ?? "active" } });
  }
  return and;
}

/** Every row that matches the filters, for a spreadsheet rather than a page. */
export async function exportAssets(query: AssetRegistryQuery): Promise<LguAsset[]> {
  const and = assetFilter(query);
  const json = (await directusGet(
    "/items/lgu_asset?filter=" + encodeURIComponent(JSON.stringify({ _and: and })) +
      "&sort=property_no&limit=-1"
  )) as { data: Record<string, unknown>[] };
  return (json.data ?? []).map(mapAsset);
}

export async function listAssets(
  query: AssetRegistryQuery
): Promise<{ assets: LguAsset[]; total: number; statusCounts: RegistryStatusCounts }> {
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.min(100, Math.max(5, Number(query.pageSize ?? 10)));
  const and = assetFilter(query);

  const sortKey = (query.sort && query.sort in ASSET_SORT_FIELDS ? query.sort : "property_no") as AssetSortKey;
  const sortParam = (query.dir === "desc" ? "-" : "") + ASSET_SORT_FIELDS[sortKey];

  const filter = JSON.stringify({ _and: and });
  const path =
    "/items/lgu_asset?filter=" + encodeURIComponent(filter) +
    "&sort=" + sortParam + ",property_no&limit=" + pageSize +
    "&offset=" + (page - 1) * pageSize +
    "&meta=filter_count";

  const json = (await directusGet(path)) as { data: Record<string, unknown>[]; meta?: { filter_count?: number } };

  // what the whole register holds, not just the filtered page, so a disposal is visible
  const countsJson = await memo<{ data?: { record_status?: string; count?: { id?: number | string } }[] }>(
    "lgu:statusCounts",
    30_000,
    () => directusGet("/items/lgu_asset?groupBy[]=record_status&aggregate[count]=id&limit=-1") as Promise<{ data?: { record_status?: string; count?: { id?: number | string } }[] }>
  );
  const statusCounts: RegistryStatusCounts = {};
  let all = 0;
  for (const row of countsJson.data ?? []) {
    const key = text(row.record_status) || "unknown";
    const n = Number(row.count?.id ?? 0);
    statusCounts[key] = n;
    all += n;
  }
  statusCounts.all = all;

  return {
    assets: (json.data ?? []).map(mapAsset),
    total: Number(json.meta?.filter_count ?? (json.data ?? []).length),
    statusCounts,
  };
}

async function nextPropertyNo(classId: number, acquisitionDate: string): Promise<string> {
  const lookups = await fetchLookups();
  const cls = lookups.classes.find((c) => c.id === classId);
  const prefix = (cls?.property_prefix || "OTHR").toUpperCase();
  const year = new Date(acquisitionDate).getFullYear();
  const stem = prefix + "-" + year + "-";

  const filter = JSON.stringify({ property_no: { _starts_with: stem } });
  const path = "/items/lgu_asset?filter=" + encodeURIComponent(filter) + "&fields=property_no&limit=-1";
  const json = (await directusGet(path)) as { data: Record<string, unknown>[] };

  let max = 0;
  for (const row of json.data ?? []) {
    const tail = text(row.property_no).slice(stem.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return stem + String(max + 1).padStart(4, "0");
}

function serializeInput(input: LguAssetInput): Record<string, unknown> {
  const cost = Number(input.cost ?? 0);
  const life = input.life_months ?? null;
  const residual = computeResidual(cost);
  return {
    description: input.description,
    class_id: input.class_id,
    is_semi_expendable: isSemiExpendable(cost, life),
    cost,
    acquisition_date: input.acquisition_date,
    available_for_use_date: input.available_for_use_date ?? null,
    life_months: life,
    residual_value: residual,
    office_id: input.office_id ?? null,
    accountable_officer_id: input.accountable_officer_id ?? null,
    accountable_officer_name: input.accountable_officer_name ?? null,
    location: input.location ?? null,
    condition_id: input.condition_id ?? null,
    mode_of_acquisition: input.mode_of_acquisition ?? "purchase",
    fund_source_id: input.fund_source_id ?? null,
    donor_name: input.donor_name ?? null,
    supplier: input.supplier ?? null,
    po_no: input.po_no ?? null,
    invoice_no: input.invoice_no ?? null,
    iar_no: input.iar_no ?? null,
    serial_no: input.serial_no ?? null,
    brand: input.brand ?? null,
    model: input.model ?? null,
    remarks: input.remarks ?? null,
    unit_of_measure: input.unit_of_measure ?? "pc",
    record_status: "active",
    status: "active",
  };
}

export async function createAsset(input: LguAssetInput): Promise<LguAsset> {
  forget("lgu:statusCounts");
  const payload = serializeInput(input);

  // A supplied number is a legacy paper number and must pass through untouched.
  if (input.property_no && input.property_no.trim()) {
    payload.property_no = input.property_no.trim();
    return insertOnce(payload);
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    payload.property_no = await nextPropertyNo(input.class_id, input.acquisition_date);
    try {
      return await insertOnce(payload);
    } catch (err) {
      lastError = err;
      const msg = String(err instanceof Error ? err.message : err);
      if (!msg.includes("has to be unique")) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not allocate a property number");
}

async function insertOnce(payload: Record<string, unknown>): Promise<LguAsset> {
  const res = await fetch(itemsUrl("lgu_asset"), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) throw new Error("Create failed " + res.status + ": " + body.slice(0, 300));
  const json = JSON.parse(body) as { data: Record<string, unknown> };
  return mapAsset(json.data);
}

const MAX_BULK = 200;

function nextNumbers(prefix: string, year: number, startAt: number, count: number): string[] {
  const stem = prefix + "-" + year + "-";
  const out: string[] = [];
  for (let i = 1; i <= count; i += 1) out.push(stem + String(startAt + i).padStart(4, "0"));
  return out;
}

async function highestSequence(prefix: string, year: number): Promise<number> {
  const stem = prefix + "-" + year + "-";
  const filter = JSON.stringify({ property_no: { _starts_with: stem } });
  const path = "/items/lgu_asset?filter=" + encodeURIComponent(filter) + "&fields=property_no&limit=-1";
  const json = (await directusGet(path)) as { data: Record<string, unknown>[] };
  let max = 0;
  for (const row of json.data ?? []) {
    const n = parseInt(text(row.property_no).slice(stem.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/**
 * One voucher, many units. The voucher total is authoritative, the unit cost is derived,
 * and any unallocated centavos are stored on the batch so nothing disappears.
 */
export async function createBulkAssets(input: BulkAssetInput): Promise<BulkCreateResult> {
  const quantity = Math.floor(Number(input.quantity));
  if (!Number.isFinite(quantity) || quantity < 2) throw new Error("Bulk entry needs at least 2 units");
  if (quantity > MAX_BULK) throw new Error("Bulk entry is limited to " + MAX_BULK + " units per save");
  if (!input.description || !input.class_id || !input.acquisition_date) {
    throw new Error("description, class_id and acquisition_date are required");
  }
  const batchTotal = Number(input.batch_total);
  if (!Number.isFinite(batchTotal) || batchTotal <= 0) throw new Error("The voucher total must be greater than zero");
  if (!input.life_months || Number(input.life_months) <= 0) throw new Error("Useful life in months is required");

  const lookups = await fetchLookups();
  const cls = lookups.classes.find((c) => c.id === input.class_id);
  const prefix = (cls?.property_prefix || "OTHR").toUpperCase();
  const year = new Date(input.acquisition_date).getFullYear();
  const { unitCost, remainder } = splitBatchTotal(batchTotal, quantity);
  const semi = isSemiExpendable(unitCost, input.life_months);
  const batchId = "BULK-" + Date.now().toString(36).toUpperCase() + "-" + Math.floor(Math.random() * 900 + 100);
  const residual = computeResidual(unitCost);

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const start = await highestSequence(prefix, year);
    const numbers = nextNumbers(prefix, year, start, quantity);
    const rows = numbers.map((propertyNo) => ({
      property_no: propertyNo,
      description: input.description,
      class_id: input.class_id,
      is_semi_expendable: semi,
      cost: unitCost,
      acquisition_date: input.acquisition_date,
      available_for_use_date: input.acquisition_date,
      life_months: input.life_months,
      residual_value: residual,
      office_id: input.office_id ?? null,
      condition_id: input.condition_id ?? null,
      mode_of_acquisition: input.mode_of_acquisition ?? "purchase",
      fund_source_id: input.fund_source_id ?? null,
      supplier: input.supplier ?? null,
      voucher_no: input.voucher_no ?? null,
      brand: input.brand ?? null,
      model: input.model ?? null,
      unit_of_measure: input.unit_of_measure ?? "pc",
      remarks: input.remarks ?? null,
      is_bulk_child: true,
      bulk_batch_id: batchId,
      batch_total: batchTotal,
      rounding_remainder: remainder,
      record_status: "active",
      status: "active",
    }));

    try {
      const res = await fetch(itemsUrl("lgu_asset"), {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(rows),
      });
      const body = await res.text();
      if (!res.ok) throw new Error("Bulk create failed " + res.status + ": " + body.slice(0, 250));
      const json = JSON.parse(body) as { data: Record<string, unknown>[] };
      return {
        batchId,
        unitCost,
        remainder,
        created: (json.data ?? []).map(mapAsset),
      };
    } catch (err) {
      lastError = err;
      const msg = String(err instanceof Error ? err.message : err);
      if (!msg.includes("has to be unique")) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not allocate property numbers for the batch");
}

export async function getAsset(id: number): Promise<LguAsset | null> {
  const json = (await directusGet("/items/lgu_asset/" + id)) as { data: Record<string, unknown> | null };
  return json.data ? mapAsset(json.data) : null;
}

export async function updateAsset(id: number, input: Partial<LguAssetInput>): Promise<LguAsset> {
  forget("lgu:statusCounts");
  const patch: Record<string, unknown> = {};
  const keys: (keyof LguAssetInput)[] = [
    "description", "class_id", "cost", "acquisition_date", "available_for_use_date",
    "life_months", "office_id", "accountable_officer_id", "accountable_officer_name",
    "location", "condition_id", "mode_of_acquisition", "fund_source_id", "donor_name",
    "supplier", "po_no", "invoice_no", "iar_no", "serial_no", "brand", "model", "remarks",
    "property_no",
  ];
  for (const k of keys) {
    if (k in input) patch[k] = (input as Record<string, unknown>)[k] ?? null;
  }
  if ("cost" in input || "life_months" in input) {
    const cost = Number((input.cost ?? 0) as number);
    const life = (input.life_months ?? null) as number | null;
    patch.is_semi_expendable = isSemiExpendable(cost, life);
    patch.residual_value = computeResidual(cost);
  }

  const res = await fetch(itemsUrl("lgu_asset") + "/" + id, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(patch),
  });
  const body = await res.text();
  if (!res.ok) throw new Error("Update failed " + res.status + ": " + body.slice(0, 300));
  const json = JSON.parse(body) as { data: Record<string, unknown> };
  return mapAsset(json.data);
}

/** Soft retire. Nothing is ever hard deleted from a PPE register. */
export async function retireAsset(id: number): Promise<LguAsset> {
  forget("lgu:statusCounts");
  const res = await fetch(itemsUrl("lgu_asset") + "/" + id, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({ status: "inactive", record_status: "disposed" }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error("Retire failed " + res.status + ": " + body.slice(0, 300));
  const json = JSON.parse(body) as { data: Record<string, unknown> };
  return mapAsset(json.data);
}
