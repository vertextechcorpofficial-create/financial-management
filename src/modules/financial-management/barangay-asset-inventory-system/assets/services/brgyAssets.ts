import { bool, enc, get, list, num, patch, post, text } from "../../shared/api";
import type {
  Brgy,
  BrgyAsset,
  BrgyCondition,
  BrgyHistoryEntry,
  BrgyAssignment,
  BrgyClassification,
  BrgyCustodian,
  BrgyOffice,
  BrgySettings,
  BrgyStatus,
} from "../../types";
import { canAssign, canMove, projectedTotal, projectedValue, REASON_REQUIRED, sameName } from "../../types";

type Row = Record<string, unknown>;

export function mapAsset(row: Row): BrgyAsset {
  return {
    id: Number(row.id),
    asset_code: text(row.asset_code),
    barangay_id: Number(row.barangay_id),
    owner_type: (text(row.owner_type) || "barangay") as "barangay" | "lgu",
    name: text(row.name),
    classification_id: num(row.classification_id),
    barcode: (row.barcode as string) ?? null,
    tag_no: (row.tag_no as string) ?? null,
    security_tag: (row.security_tag as string) ?? null,
    serial_no: (row.serial_no as string) ?? null,
    office_id: num(row.office_id),
    custodian_id: num(row.custodian_id),
    date_acquired: (row.date_acquired as string) ?? null,
    cost: Number(row.cost ?? 0),
    quantity: Number(row.quantity ?? 1),
    life_span_years: Number(row.life_span_years ?? 0),
    condition: (text(row.condition) || "Good") as BrgyCondition,
    status: (text(row.status) || "Unassigned") as BrgyStatus,
    photo: (row.photo as string) ?? null,
    remarks: (row.remarks as string) ?? null,
    is_draft: bool(row.is_draft),
    cancelled: bool(row.cancelled),
    cancel_reason: (row.cancel_reason as string) ?? null,
    source: (row.source as string) ?? null,
    created_by: (row.created_by as string) ?? null,
  };
}

export interface BrgyLookups {
  barangays: Brgy[];
  classifications: BrgyClassification[];
  offices: BrgyOffice[];
  custodians: BrgyCustodian[];
  settings: BrgySettings | null;
}

export async function fetchLookups(barangayId?: number | null): Promise<BrgyLookups> {
  const officeFilter = barangayId ? "&filter=" + enc({ barangay_id: { _eq: barangayId } }) : "";
  const custodianFilter = officeFilter;
  const [barangays, classifications, offices, custodians, settings] = await Promise.all([
    get<Row[]>("/items/brgy_barangay?sort=code&limit=-1&fields=id,code,name,district,contact_person,status"),
    get<Row[]>("/items/brgy_classification?sort=sort,name&limit=-1&fields=id,name,life_span_years,sort,status"),
    get<Row[]>("/items/brgy_office?sort=sort,name&limit=-1" + officeFilter + "&fields=id,barangay_id,name,sort,status"),
    get<Row[]>("/items/brgy_custodian?sort=full_name&limit=-1" + custodianFilter + "&fields=id,barangay_id,full_name,position,status"),
    get<Row[]>("/items/brgy_settings?limit=1&fields=id,barangay_id,salvage_percent,approval_required,valuation_method,life_equipment,life_machinery,life_furniture,life_other"),
  ]);
  const s = settings?.[0];
  return {
    barangays: barangays.map((b) => ({
      id: Number(b.id), code: text(b.code), name: text(b.name),
      district: (b.district as string) ?? null, contact_person: (b.contact_person as string) ?? null, status: text(b.status),
    })),
    classifications: classifications.map((c) => ({
      id: Number(c.id), name: text(c.name), life_span_years: num(c.life_span_years), sort: Number(c.sort ?? 0), status: text(c.status),
    })),
    offices: offices.map((o) => ({ id: Number(o.id), barangay_id: Number(o.barangay_id), name: text(o.name), sort: Number(o.sort ?? 0), status: text(o.status) })),
    custodians: custodians.map((c) => ({ id: Number(c.id), barangay_id: Number(c.barangay_id), full_name: text(c.full_name), position: (c.position as string) ?? null, status: text(c.status) })),
    settings: s
      ? {
          id: Number(s.id), barangay_id: num(s.barangay_id), salvage_percent: Number(s.salvage_percent ?? 0),
          approval_required: bool(s.approval_required), valuation_method: text(s.valuation_method) || "straight_line",
          life_equipment: num(s.life_equipment), life_machinery: num(s.life_machinery),
          life_furniture: num(s.life_furniture), life_other: num(s.life_other),
        }
      : null,
  };
}

const ASSET_FIELDS =
  "id,asset_code,barangay_id,owner_type,name,classification_id,barcode,tag_no,security_tag,serial_no,office_id,custodian_id,date_acquired,cost,quantity,life_span_years,condition,status,photo,remarks,is_draft,cancelled,cancel_reason,source,created_by";

export interface AssetListResult {
  assets: BrgyAsset[];
  total: number;
  asOf: string;
  salvagePercent: number;
}

export async function listAssets(params: {
  barangayId: number;
  q?: string;
  status?: string;
  condition?: string;
  includeDrafts?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<AssetListResult> {
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(5, Number(params.pageSize ?? 20)));
  const and: Row[] = [{ barangay_id: { _eq: params.barangayId } }, { cancelled: { _eq: false } }];
  if (!params.includeDrafts) and.push({ is_draft: { _eq: false } });
  if (params.q && params.q.trim()) {
    const n = params.q.trim();
    and.push({
      _or: [
        { name: { _icontains: n } },
        { asset_code: { _icontains: n } },
        { barcode: { _icontains: n } },
        { tag_no: { _icontains: n } },
        { security_tag: { _icontains: n } },
        { serial_no: { _icontains: n } },
      ],
    });
  }
  if (params.status && params.status !== "all") and.push({ status: { _eq: params.status } });
  if (params.condition && params.condition !== "all") and.push({ condition: { _eq: params.condition } });

  const pageResult = await list<Row>(
    "/items/brgy_asset?filter=" + enc({ _and: and }) +
      "&sort=asset_code&limit=" + pageSize + "&offset=" + (page - 1) * pageSize +
      "&meta=filter_count&fields=" + ASSET_FIELDS
  );
  const rows = pageResult.data;
  const total = pageResult.count;
  const lookups = await fetchLookups(params.barangayId);
  return {
    assets: rows.map(mapAsset),
    total,
    asOf: new Date().toISOString().slice(0, 10),
    salvagePercent: lookups.settings?.salvage_percent ?? 0,
  };
}

/** Rule 13: AST-(barangay code)-(running number), never reused within a barangay. */
async function nextAssetCode(barangayId: number): Promise<string> {
  const bar = await get<Row[]>("/items/brgy_barangay?filter=" + enc({ id: { _eq: barangayId } }) + "&fields=code&limit=1");
  const code = text(bar?.[0]?.code) || "BRG";
  const stem = "AST-" + code + "-";
  const rows = await get<Row[]>("/items/brgy_asset?filter=" + enc({ asset_code: { _starts_with: stem } }) + "&fields=asset_code&limit=-1");
  let max = 0;
  for (const r of rows ?? []) {
    const tail = text(r.asset_code).slice(stem.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return stem + String(max + 1).padStart(4, "0");
}

export interface AssetInput {
  barangayId: number;
  name: string;
  classificationId: number | null;
  barcode?: string | null;
  tagNo?: string | null;
  securityTag?: string | null;
  serialNo?: string | null;
  officeId?: number | null;
  custodianId?: number | null;
  dateAcquired: string;
  cost: number;
  quantity: number;
  lifeSpanYears: number;
  condition: BrgyCondition;
  remarks?: string | null;
  isDraft?: boolean;
  createdBy?: string | null;
  photo?: string | null;
}

/** Section 4.1 plus the section 5 rules that can be checked from the data alone. */
export async function createAsset(input: AssetInput): Promise<BrgyAsset> {
  if (!input.name || !input.name.trim()) throw new Error("Item name is required");
  if (!input.dateAcquired) throw new Error("Date acquired is required");
  const today = new Date().toISOString().slice(0, 10);
  if (input.dateAcquired > today) throw new Error("Date acquired cannot be later than today");
  if (!Number.isFinite(input.quantity) || input.quantity < 1) throw new Error("Quantity must be at least 1");
  if (!Number.isFinite(input.cost) || input.cost < 0) throw new Error("Cost cannot be negative");
  const settings = (await fetchLookups(input.barangayId)).settings;
  let lifeSpan = Number(input.lifeSpanYears);
  if (!Number.isFinite(lifeSpan) || lifeSpan < 1) {
    const classification = (await fetchLookups(input.barangayId)).classifications.find((c) => c.id === input.classificationId);
    const byName = classification?.name?.toLowerCase() ?? "";
    lifeSpan =
      (byName.includes("equipment") && settings?.life_equipment) ||
      (byName.includes("machinery") && settings?.life_machinery) ||
      (byName.includes("furniture") && settings?.life_furniture) ||
      (byName.includes("other") && settings?.life_other) ||
      classification?.life_span_years ||
      1;
  }
  if (!Number.isFinite(lifeSpan) || lifeSpan < 1) throw new Error("Life span must be at least 1 year");

  // Rule: barcode, tag number and security tag are unique when filled in
  for (const [field, label] of [["barcode", "barcode"], ["tag_no", "tag number"], ["security_tag", "security tag"]] as const) {
    const value =
      field === "barcode" ? input.barcode : field === "tag_no" ? input.tagNo : input.securityTag;
    if (!value || !value.trim()) continue;
    const clash = await get<Row[]>(
      "/items/brgy_asset?filter=" + enc({ _and: [{ [field]: { _eq: value.trim() } }, { cancelled: { _eq: false } }] }) +
        "&fields=asset_code,name&limit=1"
    );
    if (clash && clash.length) {
      throw new Error("This " + label + " is already used by asset " + text(clash[0].asset_code) + " (" + text(clash[0].name) + ").");
    }
  }

  // rule 5.13: names are compared ignoring case and extra spaces, so reuse the existing spelling
  const sameNamed = await get<Row[]>("/items/brgy_asset?filter=" + enc({ name: { _icontains: input.name.trim() } }) + "&fields=name&limit=-1");
  const storedName = (sameNamed ?? []).map((r) => text(r.name)).find((n) => sameName(n, input.name)) ?? input.name.trim();

  const status: BrgyStatus = input.custodianId ? "Active" : "Unassigned";
  const created = await post<Row>("/items/brgy_asset", {
    asset_code: await nextAssetCode(input.barangayId),
    barangay_id: input.barangayId,
    owner_type: "barangay",
    name: storedName,
    classification_id: input.classificationId,
    barcode: input.barcode?.trim() || null,
    tag_no: input.tagNo?.trim() || null,
    security_tag: input.securityTag?.trim() || null,
    serial_no: input.serialNo?.trim() || null,
    office_id: input.officeId ?? null,
    custodian_id: input.custodianId ?? null,
    date_acquired: input.dateAcquired,
    cost: input.cost,
    quantity: input.quantity,
    life_span_years: lifeSpan,
    condition: input.condition,
    status,
    photo: input.photo ?? null,
    remarks: input.remarks ?? null,
    is_draft: input.isDraft ?? false,
    cancelled: false,
    source: "purchase",
    created_by: input.createdBy ?? null,
  });
  const asset = mapAsset(created);

  await recordHistory(asset.id, "registered", null, status, input.createdBy ?? null, "Asset registered");
  if (input.custodianId) {
    await post("/items/brgy_assignment", {
      asset_id: asset.id,
      custodian_id: input.custodianId,
      office_id: input.officeId ?? null,
      start_date: input.dateAcquired,
      remarks: "Initial assignment",
      created_by: input.createdBy ?? null,
    });
  }
  return asset;
}

/**
 * Table 5 grants "Register or edit an asset", and section 4.1 says a half finished form can be
 * saved as a draft and completed later. Editing is that path, and it keeps the same rules.
 */
export async function updateAsset(input: {
  assetId: number;
  name?: string;
  classificationId?: number | null;
  barcode?: string | null;
  tagNo?: string | null;
  securityTag?: string | null;
  serialNo?: string | null;
  officeId?: number | null;
  dateAcquired?: string | null;
  cost?: number;
  quantity?: number;
  lifeSpanYears?: number;
  condition?: BrgyCondition;
  remarks?: string | null;
  photo?: string | null;
  isDraft?: boolean;
  actor?: string | null;
}): Promise<AssetDetail> {
  const detail = await fetchAsset(input.assetId);
  const asset = detail.asset;
  if (asset.cancelled) throw new Error("A cancelled record cannot be edited");
  if (asset.status === "Disposed") throw new Error("A disposed asset cannot be edited");

  const body: Row = {};

  if (input.name !== undefined) {
    if (!input.name.trim()) throw new Error("Item name is required");
    const sameNamed = await get<Row[]>(
      "/items/brgy_asset?filter=" + enc({ _and: [{ name: { _icontains: input.name.trim() } }, { id: { _neq: asset.id } }] }) + "&fields=name&limit=-1"
    );
    body.name = (sameNamed ?? []).map((r) => text(r.name)).find((n) => sameName(n, input.name as string)) ?? input.name.trim();
  }

  if (input.dateAcquired !== undefined) {
    const today = new Date().toISOString().slice(0, 10);
    if (input.dateAcquired && input.dateAcquired > today) throw new Error("Date acquired cannot be later than today");
    body.date_acquired = input.dateAcquired;
  }

  if (input.quantity !== undefined) {
    if (!Number.isFinite(input.quantity) || input.quantity < 1) throw new Error("Quantity must be at least 1");
    body.quantity = input.quantity;
  }
  if (input.cost !== undefined) {
    if (!Number.isFinite(input.cost) || input.cost < 0) throw new Error("Cost cannot be negative");
    body.cost = input.cost;
  }
  if (input.lifeSpanYears !== undefined) {
    if (!Number.isFinite(input.lifeSpanYears) || input.lifeSpanYears < 1) throw new Error("Life span must be at least 1 year");
    body.life_span_years = input.lifeSpanYears;
  }

  // the same uniqueness rule as creation, ignoring this asset
  for (const [field, value, label] of [
    ["barcode", input.barcode, "barcode"],
    ["tag_no", input.tagNo, "tag number"],
    ["security_tag", input.securityTag, "security tag"],
  ] as const) {
    if (value === undefined) continue;
    if (value && value.trim()) {
      const clash = await get<Row[]>(
        "/items/brgy_asset?filter=" + enc({ _and: [{ [field]: { _eq: value.trim() } }, { cancelled: { _eq: false } }, { id: { _neq: asset.id } }] }) + "&fields=asset_code,name&limit=1"
      );
      if (clash && clash.length) {
        throw new Error("This " + label + " is already used by asset " + text(clash[0].asset_code) + " (" + text(clash[0].name) + ").");
      }
    }
    body[field] = value && value.trim() ? value.trim() : null;
  }

  if (input.classificationId !== undefined) body.classification_id = input.classificationId;
  if (input.serialNo !== undefined) body.serial_no = input.serialNo?.trim() || null;
  if (input.officeId !== undefined) body.office_id = input.officeId;
  if (input.condition !== undefined) body.condition = input.condition;
  if (input.remarks !== undefined) body.remarks = input.remarks;
  if (input.photo !== undefined) body.photo = input.photo;
  if (input.isDraft !== undefined) {
    body.is_draft = input.isDraft;
    // completing a draft needs a custodian decision later, so the status stays as it is
  }

  if (Object.keys(body).length === 0) return detail;

  await patch("/items/brgy_asset/" + asset.id, body);
  await recordHistory(
    asset.id,
    input.isDraft === false && asset.is_draft ? "draft completed" : "edited",
    null,
    null,
    input.actor ?? null,
    Object.keys(body).join(", ")
  );
  return fetchAsset(asset.id);
}

export async function recordHistory(
  assetId: number,
  action: string,
  fromValue: string | null,
  toValue: string | null,
  actor: string | null,
  remarks?: string | null
): Promise<void> {
  await post("/items/brgy_asset_history", {
    asset_id: assetId,
    action,
    from_value: fromValue,
    to_value: toValue,
    remarks: remarks ?? null,
    actor: actor ?? null,
  });
}

export interface AssetDetail {
  asset: BrgyAsset;
  assignments: BrgyAssignment[];
  history: BrgyHistoryEntry[];
  projected: number;
  projectedTotalValue: number;
}

export async function fetchAsset(id: number): Promise<AssetDetail> {
  const [assetRows, assignments, history] = await Promise.all([
    get<Row[]>("/items/brgy_asset?filter=" + enc({ id: { _eq: id } }) + "&fields=" + ASSET_FIELDS + "&limit=1"),
    get<Row[]>("/items/brgy_assignment?filter=" + enc({ asset_id: { _eq: id } }) + "&sort=-start_date&limit=-1&fields=id,asset_id,custodian_id,office_id,start_date,end_date,remarks,created_by"),
    get<Row[]>("/items/brgy_asset_history?filter=" + enc({ asset_id: { _eq: id } }) + "&sort=-date_created&limit=-1&fields=id,asset_id,action,from_value,to_value,remarks,actor,date_created"),
  ]);
  if (!assetRows?.length) throw new Error("Asset " + id + " not found");
  const asset = mapAsset(assetRows[0]);
  const lookups = await fetchLookups(asset.barangay_id);
  const salvage = lookups.settings?.salvage_percent ?? 0;
  const asOf = new Date().toISOString().slice(0, 10);
  return {
    asset,
    assignments: (assignments ?? []).map((a) => ({
      id: Number(a.id), asset_id: Number(a.asset_id), custodian_id: num(a.custodian_id), office_id: num(a.office_id),
      start_date: (a.start_date as string) ?? null, end_date: (a.end_date as string) ?? null,
      remarks: (a.remarks as string) ?? null, created_by: (a.created_by as string) ?? null,
    })),
    history: (history ?? []).map((h) => ({
      id: Number(h.id), asset_id: Number(h.asset_id), action: text(h.action),
      from_value: (h.from_value as string) ?? null, to_value: (h.to_value as string) ?? null,
      remarks: (h.remarks as string) ?? null, actor: (h.actor as string) ?? null, date_created: (h.date_created as string) ?? null,
    })),
    projected: projectedValue(asset, asOf, salvage),
    projectedTotalValue: projectedTotal(asset, asOf, salvage),
  };
}

/** Section 4.2: close the previous assignment, open exactly one new one. */
export async function assignCustodian(input: {
  assetId: number;
  custodianId: number;
  officeId: number | null;
  remarks?: string | null;
  actor?: string | null;
  startDate?: string;
}): Promise<AssetDetail> {
  const detail = await fetchAsset(input.assetId);
  const asset = detail.asset;
  if (!canAssign(asset.status)) {
    throw new Error("This asset is " + asset.status + " and cannot be assigned.");
  }
  if (!input.custodianId) throw new Error("Choose the custodian who will be responsible for this asset");
  const today = input.startDate ?? new Date().toISOString().slice(0, 10);
  // rule 5.7: an assignment cannot start before the date acquired
  if (asset.date_acquired && today < asset.date_acquired) {
    throw new Error("An assignment cannot start before the date acquired (" + asset.date_acquired + ").");
  }

  const open = detail.assignments.filter((a) => !a.end_date);
  for (const row of open) {
    await patch("/items/brgy_assignment/" + row.id, { end_date: today });
  }
  await post("/items/brgy_assignment", {
    asset_id: asset.id,
    custodian_id: input.custodianId,
    office_id: input.officeId,
    start_date: today,
    remarks: input.remarks ?? null,
    created_by: input.actor ?? null,
  });
  await patch("/items/brgy_asset/" + asset.id, { custodian_id: input.custodianId, office_id: input.officeId, status: "Active" });
  await recordHistory(asset.id, "assigned", asset.custodian_id ? String(asset.custodian_id) : null, String(input.custodianId), input.actor ?? null, input.remarks ?? null);
  return fetchAsset(asset.id);
}

/** Section 4.3: condition changes, with the suggested status move. */
export async function updateCondition(input: {
  assetId: number;
  condition: BrgyCondition;
  remarks: string;
  actor?: string | null;
}): Promise<AssetDetail> {
  const detail = await fetchAsset(input.assetId);
  if (!input.remarks || !input.remarks.trim()) throw new Error("Please give a remark for the condition change");
  await patch("/items/brgy_asset/" + detail.asset.id, { condition: input.condition });
  await recordHistory(detail.asset.id, "condition", detail.asset.condition, input.condition, input.actor ?? null, input.remarks);
  return fetchAsset(detail.asset.id);
}

/** Section 4.4 to 4.6: status moves, validated against the allowed table. */
export async function changeStatus(input: {
  assetId: number;
  to: BrgyStatus;
  reason?: string | null;
  actor?: string | null;
  repairNote?: string | null;
  /** section 4.4: when a repair finishes the condition goes back to Good or Fair */
  condition?: BrgyCondition | null;
}): Promise<AssetDetail> {
  const detail = await fetchAsset(input.assetId);
  const asset = detail.asset;
  if (asset.status === input.to) throw new Error("This asset is already " + input.to);
  if (!canMove(asset.status, input.to)) {
    throw new Error("An asset that is " + asset.status + " cannot move to " + input.to + ".");
  }
  if (REASON_REQUIRED.includes(input.to) && (!input.reason || !input.reason.trim())) {
    throw new Error("Please give a reason before changing the status to " + input.to + ".");
  }
  const patchBody: Row = { status: input.to };
  if (input.condition) patchBody.condition = input.condition;
  else if (input.to === "Active" && asset.condition === "Unserviceable") patchBody.condition = "Good";
  if (input.to === "Under Repair" && input.repairNote) patchBody.remarks = [asset.remarks, "Repairer: " + input.repairNote].filter(Boolean).join("\n");
  await patch("/items/brgy_asset/" + asset.id, patchBody);
  await recordHistory(asset.id, "status", asset.status, input.to, input.actor ?? null, input.reason ?? input.repairNote ?? null);
  if (input.to === "Missing" || input.to === "For Disposal") {
    const open = detail.assignments.filter((a) => !a.end_date);
    for (const row of open) await patch("/items/brgy_assignment/" + row.id, { end_date: new Date().toISOString().slice(0, 10) });
  }
  return fetchAsset(asset.id);
}

/** Section 5: a wrongly encoded asset is cancelled with a reason, never erased. */
export async function cancelAsset(input: { assetId: number; reason: string; actor?: string | null }): Promise<void> {
  if (!input.reason || !input.reason.trim()) throw new Error("A reason is required to cancel an asset");
  const detail = await fetchAsset(input.assetId);
  await patch("/items/brgy_asset/" + detail.asset.id, { cancelled: true, cancel_reason: input.reason.trim() });
  await recordHistory(detail.asset.id, "cancelled", detail.asset.status, "Cancelled", input.actor ?? null, input.reason.trim());
}

export async function updateSettings(input: {
  salvagePercent: number;
  approvalRequired: boolean;
  lifeEquipment: number | null;
  lifeMachinery: number | null;
  lifeFurniture: number | null;
  lifeOther: number | null;
}): Promise<BrgySettings> {
  const rows = await get<Row[]>("/items/brgy_settings?limit=1&fields=id");
  const body = {
    salvage_percent: input.salvagePercent,
    approval_required: input.approvalRequired,
    valuation_method: "straight_line",
    life_equipment: input.lifeEquipment,
    life_machinery: input.lifeMachinery,
    life_furniture: input.lifeFurniture,
    life_other: input.lifeOther,
  };
  if (rows?.length) await patch("/items/brgy_settings/" + rows[0].id, body);
  else await post("/items/brgy_settings", body);
  const lookups = await fetchLookups();
  return lookups.settings as BrgySettings;
}
