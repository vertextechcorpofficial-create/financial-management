import crypto from "crypto";
import {
  AssetTableData,
  Department,
  ItemClassification,
  ItemType,
  User,
  AssetClass,
  AssetCondition,
} from "../types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

interface DirectusRecord {
  id?: number;
  [key: string]: unknown;
}

const FALLBACK_DEPARTMENTS: Department[] = [
  { department_id: 1, department_name: "IT" },
  { department_id: 2, department_name: "Human Resources" },
  { department_id: 3, department_name: "Finance" },
  { department_id: 4, department_name: "Admin" },
  { department_id: 5, department_name: "Logistics" },
  { department_id: 6, department_name: "Production" },
];

const FALLBACK_USERS: User[] = [
  { user_id: 1, user_fname: "Maria", user_lname: "Santos", department_id: 1 },
  { user_id: 2, user_fname: "Paolo", user_lname: "Reyes", department_id: 1 },
  { user_id: 3, user_fname: "Jenny", user_lname: "Cruz", department_id: 2 },
  { user_id: 4, user_fname: "Mark", user_lname: "Villanueva", department_id: 3 },
  { user_id: 5, user_fname: "Ana", user_lname: "Bautista", department_id: 4 },
  { user_id: 6, user_fname: "Ramon", user_lname: "Dela Cruz", department_id: 5 },
];

const FALLBACK_CLASSES: AssetClass[] = [
  { id: 1, name: "IT Equipment", tag_prefix: "ITE", depreciation_method_id: 1, default_life_months: 36, residual_percent: 0 },
  { id: 2, name: "Furniture & Fixtures", tag_prefix: "FUR", depreciation_method_id: 1, default_life_months: 60, residual_percent: 5 },
  { id: 3, name: "Machinery & Equipment", tag_prefix: "MCH", depreciation_method_id: 1, default_life_months: 120, residual_percent: 5 },
  { id: 4, name: "Vehicles", tag_prefix: "VEH", depreciation_method_id: 2, default_life_months: 60, residual_percent: 10 },
  { id: 5, name: "Office Equipment", tag_prefix: "OFF", depreciation_method_id: 1, default_life_months: 48, residual_percent: 0 },
];

const FALLBACK_CONDITIONS: AssetCondition[] = [
  { id: 1, condition_name: "Good", is_impairment_indicator: 0, sort_order: 1 },
  { id: 2, condition_name: "Bad", is_impairment_indicator: 1, sort_order: 2 },
  { id: 3, condition_name: "Under Maintenance", is_impairment_indicator: 0, sort_order: 3 },
  { id: 4, condition_name: "Discontinued", is_impairment_indicator: 1, sort_order: 4 },
  { id: 5, condition_name: "Poor", is_impairment_indicator: 1, sort_order: 5 },
  { id: 6, condition_name: "Damaged", is_impairment_indicator: 1, sort_order: 6 },
  { id: 7, condition_name: "For repair", is_impairment_indicator: 1, sort_order: 7 },
];

function extractDirectusError(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const obj = json as { errors?: Array<{ message?: string }>; error?: string; message?: string };
  return obj.errors?.[0]?.message || obj.error || obj.message || fallback;
}

export async function getDefaultUserId(): Promise<number> {
  const users = await fetchUsers();
  return users[0]?.user_id || 133;
}

export async function appendAuditLog(params: {
  action_id: number;
  asset_id?: number | null;
  details: string;
  user_id?: number;
  user_name?: string;
  role_name?: string;
  changes?: Array<{ field: string; from: unknown; to: unknown }>;
}): Promise<void> {
  if (!API_BASE_URL) return;
  try {
    let prevHash: string | null = null;
    const latestRes = await fetch(
      `${API_BASE_URL}/items/asset_audit_log?sort=-id&limit=1&fields=row_hash`,
      { headers: AUTH_HEADERS, cache: "no-store" }
    );
    if (latestRes.ok) {
      const latestJson = (await latestRes.json()) as { data?: Array<{ row_hash?: string }> };
      prevHash = latestJson.data?.[0]?.row_hash || null;
    }

    const userId = params.user_id || (await getDefaultUserId());
    const userName = params.user_name || "Property Officer";
    const roleName = params.role_name || "Asset Manager";
    const payloadToHash = JSON.stringify({
      prev: prevHash,
      ts: Date.now(),
      user_id: userId,
      action_id: params.action_id,
      asset_id: params.asset_id ?? null,
      details: params.details,
    });
    const rowHash = crypto.createHash("sha256").update(payloadToHash).digest("hex");

    await fetch(`${API_BASE_URL}/items/asset_audit_log`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        user_id: userId,
        user_name: userName,
        role_name: roleName,
        action_id: params.action_id,
        asset_id: params.asset_id ?? null,
        details: params.details,
        changes: params.changes ?? null,
        prev_hash: prevHash,
        row_hash: rowHash,
      }),
    });
  } catch (err) {
    console.warn("appendAuditLog skipped:", err);
  }
}

export async function fetchDepartments(): Promise<Department[]> {
  try {
    if (!API_BASE_URL) return FALLBACK_DEPARTMENTS;
    const res = await fetch(`${API_BASE_URL}/items/department?limit=-1`, {
      headers: AUTH_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return FALLBACK_DEPARTMENTS;
    const json = (await res.json()) as { data?: Department[] };
    return json.data?.length ? json.data : FALLBACK_DEPARTMENTS;
  } catch {
    return FALLBACK_DEPARTMENTS;
  }
}

export async function fetchUsers(): Promise<User[]> {
  try {
    if (!API_BASE_URL) return FALLBACK_USERS;
    const res = await fetch(`${API_BASE_URL}/items/user?limit=-1`, {
      headers: AUTH_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return FALLBACK_USERS;
    const json = (await res.json()) as { data?: User[] };
    return json.data?.length ? json.data : FALLBACK_USERS;
  } catch {
    return FALLBACK_USERS;
  }
}

export async function fetchAssetClasses(): Promise<AssetClass[]> {
  try {
    if (!API_BASE_URL) return FALLBACK_CLASSES;
    const res = await fetch(`${API_BASE_URL}/items/asset_classes?limit=-1`, {
      headers: AUTH_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return FALLBACK_CLASSES;
    const json = (await res.json()) as { data?: AssetClass[] };
    return json.data?.length ? json.data : FALLBACK_CLASSES;
  } catch {
    return FALLBACK_CLASSES;
  }
}

export async function fetchConditions(): Promise<AssetCondition[]> {
  try {
    if (!API_BASE_URL) return FALLBACK_CONDITIONS;
    const res = await fetch(`${API_BASE_URL}/items/asset_conditions?limit=-1&sort=sort_order`, {
      headers: AUTH_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return FALLBACK_CONDITIONS;
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    if (!json.data?.length) return FALLBACK_CONDITIONS;
    return json.data.map((c) => ({
      id: Number(c.id),
      condition_name: String(c.name || c.condition_name || "Good"),
      is_impairment_indicator: Number(c.is_impairment_indicator || 0),
      sort_order: Number(c.sort_order || 0),
      is_active: Number(c.is_active ?? 1),
    }));
  } catch {
    return FALLBACK_CONDITIONS;
  }
}

export async function fetchItemTypes(): Promise<ItemType[]> {
  try {
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/items/item_type?limit=-1`, {
        headers: AUTH_HEADERS,
        cache: "no-store",
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: ItemType[] };
        if (json.data?.length) return json.data;
      }
    }
  } catch {
    // fallback below
  }
  return [
    { id: 1, type_name: "Hardware" },
    { id: 2, type_name: "Mobile" },
    { id: 3, type_name: "Furniture" },
    { id: 4, type_name: "Machinery" },
    { id: 5, type_name: "Vehicle" },
  ];
}

export async function fetchItemClassifications(): Promise<ItemClassification[]> {
  const classes = await fetchAssetClasses();
  return classes.map((c) => ({
    id: c.id,
    classification_name: c.name,
    tag_prefix: c.tag_prefix,
    default_life_months: c.default_life_months,
    residual_percent: c.residual_percent,
    depreciation_method_id: c.depreciation_method_id,
  }));
}

export async function fetchItems() {
  try {
    if (API_BASE_URL) {
      const [itemsRes, typesRes, classRes] = await Promise.all([
        fetch(`${API_BASE_URL}/items/items?limit=-1`, { headers: AUTH_HEADERS, cache: "no-store" }),
        fetch(`${API_BASE_URL}/items/item_type?limit=-1`, { headers: AUTH_HEADERS, cache: "no-store" }),
        fetch(`${API_BASE_URL}/items/item_classification?limit=-1`, { headers: AUTH_HEADERS, cache: "no-store" }),
      ]);
      if (itemsRes.ok) {
        const itemsJson = (await itemsRes.json()) as { data?: DirectusRecord[] };
        const typesJson = typesRes.ok ? ((await typesRes.json()) as { data?: DirectusRecord[] }) : { data: [] };
        const classJson = classRes.ok ? ((await classRes.json()) as { data?: DirectusRecord[] }) : { data: [] };

        const typeMap = new Map<number, string>();
        (typesJson.data || []).forEach((t) => typeMap.set(Number(t.id), String(t.type_name || "")));

        const classMap = new Map<number, string>();
        (classJson.data || []).forEach((c) => classMap.set(Number(c.id), String(c.classification_name || "")));

        if (itemsJson.data?.length) {
          return itemsJson.data.map((i) => ({
            id: Number(i.id),
            item_name: String(i.item_name || ""),
            item_type: { type_name: typeMap.get(Number(i.item_type)) || "" },
            item_classification: { classification_name: classMap.get(Number(i.item_classification)) || "" },
          }));
        }
      }
    }
  } catch (err) {
    console.warn("fetchItems failed:", err);
  }
  return [];
}

export async function fetchGeneralSetting(key: string): Promise<string | null> {
  try {
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/items/asset_settings?limit=1`, {
        headers: AUTH_HEADERS,
        cache: "no-store",
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
        const row = json.data?.[0];
        if (row && row[key] !== undefined && row[key] !== null) {
          return String(row[key]);
        }
      }
    }
  } catch {
    // fallback defaults
  }
  if (key === "capitalisation_threshold") return "15000";
  if (key === "approval_threshold") return "50000";
  if (key === "approval_enabled") return "1";
  if (key === "rfid_asset_tagging") return "1";
  return null;
}

function mapRecordStatus(recordStatusId?: unknown, isActive?: unknown): "active" | "voided" | "archived" {
  if (Number(recordStatusId) === 2) return "voided";
  if (Number(recordStatusId) === 3) return "archived";
  if (isActive === 0 || isActive === false) return "voided";
  return "active";
}

function mapDepreciationMethodId(methodName?: unknown): number {
  const m = String(methodName || "").toLowerCase();
  if (m.includes("double") || m.includes("ddb")) return 2;
  if (m.includes("sum") || m.includes("syd")) return 3;
  if (m.includes("unit") || m.includes("uop")) return 4;
  if (m.includes("none") || m.includes("not")) return 5;
  return 1; // Straight-line (SL)
}

export async function fetchAssets(): Promise<AssetTableData[]> {
  if (!API_BASE_URL) {
    throw new Error("API_BASE_URL is not configured.");
  }

  const [assetsRes, itemsRes, itemTypesRes, itemClassesRes, assetClassesRes, deptsRes, usersRes, condsRes] =
    await Promise.all([
      fetch(`${API_BASE_URL}/items/assets_and_equipment?limit=-1&sort=-id`, {
        headers: AUTH_HEADERS,
        cache: "no-store",
      }),
      fetch(`${API_BASE_URL}/items/items?limit=-1`, { headers: AUTH_HEADERS, cache: "no-store" }),
      fetch(`${API_BASE_URL}/items/item_type?limit=-1`, { headers: AUTH_HEADERS, cache: "no-store" }),
      fetch(`${API_BASE_URL}/items/item_classification?limit=-1`, { headers: AUTH_HEADERS, cache: "no-store" }),
      fetch(`${API_BASE_URL}/items/asset_classes?limit=-1`, { headers: AUTH_HEADERS, cache: "no-store" }),
      fetch(`${API_BASE_URL}/items/department?limit=-1`, { headers: AUTH_HEADERS, cache: "no-store" }),
      fetch(`${API_BASE_URL}/items/user?limit=-1`, { headers: AUTH_HEADERS, cache: "no-store" }),
      fetch(`${API_BASE_URL}/items/asset_conditions?limit=-1`, { headers: AUTH_HEADERS, cache: "no-store" }),
    ]);

  if (!assetsRes.ok) {
    const errJson = await assetsRes.json().catch(() => ({}));
    throw new Error(extractDirectusError(errJson, "Failed to fetch assets from Directus."));
  }

  const assetsJson = (await assetsRes.json()) as { data?: DirectusRecord[] };
  const itemsJson = itemsRes.ok ? ((await itemsRes.json()) as { data?: DirectusRecord[] }) : { data: [] };
  const typesJson = itemTypesRes.ok ? ((await itemTypesRes.json()) as { data?: DirectusRecord[] }) : { data: [] };
  const itemClassesJson = itemClassesRes.ok
    ? ((await itemClassesRes.json()) as { data?: DirectusRecord[] })
    : { data: [] };
  const assetClassesJson = assetClassesRes.ok
    ? ((await assetClassesRes.json()) as { data?: DirectusRecord[] })
    : { data: [] };
  const deptsJson = deptsRes.ok ? ((await deptsRes.json()) as { data?: DirectusRecord[] }) : { data: [] };
  const usersJson = usersRes.ok ? ((await usersRes.json()) as { data?: DirectusRecord[] }) : { data: [] };
  const condsJson = condsRes.ok ? ((await condsRes.json()) as { data?: DirectusRecord[] }) : { data: [] };

  const itemMap = new Map<number, DirectusRecord>();
  (itemsJson.data || []).forEach((i) => itemMap.set(Number(i.id), i));

  const typeMap = new Map<number, string>();
  (typesJson.data || []).forEach((t) => typeMap.set(Number(t.id), String(t.type_name || "")));

  const itemClassMap = new Map<number, string>();
  (itemClassesJson.data || []).forEach((c) => itemClassMap.set(Number(c.id), String(c.classification_name || "")));

  const assetClassMap = new Map<number, string>();
  (assetClassesJson.data || []).forEach((c) => assetClassMap.set(Number(c.id), String(c.name || "")));

  const deptMap = new Map<number, string>();
  (deptsJson.data || []).forEach((d) =>
    deptMap.set(Number(d.department_id ?? d.id), String(d.department_name || ""))
  );

  const userMap = new Map<number, string>();
  (usersJson.data || []).forEach((u) =>
    userMap.set(Number(u.user_id ?? u.id), `${u.user_fname || ""} ${u.user_lname || ""}`.trim())
  );

  const condMap = new Map<number, string>();
  (condsJson.data || []).forEach((c) => condMap.set(Number(c.id), String(c.name || c.condition_name || "")));

  return (assetsJson.data || []).map((row) => {
    const id = Number(row.id);
    const baseItem = row.item_id ? itemMap.get(Number(row.item_id)) : undefined;
    const itemName = String(baseItem?.item_name || row.item_name || "Asset Item");
    const itemTypeName =
      (baseItem?.item_type ? typeMap.get(Number(baseItem.item_type)) : undefined) || "General";
    const classificationName =
      (row.asset_class_id ? assetClassMap.get(Number(row.asset_class_id)) : undefined) ||
      (baseItem?.item_classification ? itemClassMap.get(Number(baseItem.item_classification)) : undefined) ||
      "IT Equipment";

    const deptId = row.department ? Number(row.department) : null;
    const empId = row.employee ? Number(row.employee) : null;
    const condId = row.condition_id ? Number(row.condition_id) : undefined;
    const conditionName =
      (condId ? condMap.get(condId) : undefined) || String(row.condition || "Good");

    const cost = Number(row.acquisition_cost ?? row.cost_per_item ?? 0);
    const lifeMonths = Number(row.life_months || (Number(row.life_span) ? Number(row.life_span) * 12 : 60));
    const lifeYears = Number(row.life_span || Math.max(1, Math.round(lifeMonths / 12)));

    return {
      id,
      asset_tag: (row.asset_tag as string) || `AST-${String(id).padStart(4, "0")}`,
      barcode: (row.barcode as string) || null,
      rfid_code: (row.rfid_code as string) || (row.rfid_key as string) || null,
      serial: (row.serial as string) || null,
      brand: (row.brand as string) || null,
      model: (row.model as string) || null,
      location: (row.location as string) || null,
      security_tag: (row.security_tag as string) || "Deactivated",
      condition: conditionName,
      condition_id: condId,
      quantity: Number(row.quantity || 1),
      cost_per_item: cost,
      acquisition_cost: cost,
      total: Number(row.total ?? cost),
      residual_value: Number(row.residual_value || 0),
      total_units: row.total_units !== null && row.total_units !== undefined ? Number(row.total_units) : null,
      units_per_year:
        row.units_per_year !== null && row.units_per_year !== undefined ? Number(row.units_per_year) : null,
      projected_value: Number(row.projected_value ?? cost),
      date_acquired: String(row.date_acquired || "").split("T")[0] || new Date().toISOString().split("T")[0],
      available_for_use_date: row.available_for_use_date
        ? String(row.available_for_use_date).split("T")[0]
        : String(row.date_acquired || "").split("T")[0],
      warranty_until: row.warranty_until ? String(row.warranty_until).split("T")[0] : null,
      life_span: lifeYears,
      life_months: lifeMonths,
      record_status: mapRecordStatus(row.record_status_id, row.is_active),
      supplier_name: null,
      invoice_no: (row.invoice_no as string) || null,
      po_no: (row.po_no as string) || null,
      remarks: (row.remarks as string) || null,
      item_name: itemName,
      item_image: (row.item_image as string) || null,
      item_type_name: itemTypeName,
      classification_name: classificationName,
      department: deptId,
      department_name: deptId ? deptMap.get(deptId) || "Unassigned" : "Unassigned",
      employee: empId,
      assigned_to_name: empId ? userMap.get(empId) || "Unassigned" : "Unassigned",
      item_id: Number(row.item_id || id),
      encoder: row.encoder ? Number(row.encoder) : null,
      is_active_warning: Number(row.is_active_warning || 0),
    };
  });
}

export async function generateAssetTag(classificationName: string): Promise<string> {
  const classes = await fetchAssetClasses();
  const cls = classes.find(
    (c) => c.name.toLowerCase() === classificationName.toLowerCase()
  );
  const prefix = cls?.tag_prefix || classificationName.slice(0, 3).toUpperCase().replace(/[^A-Z]/g, "AST");

  if (API_BASE_URL) {
    try {
      const res = await fetch(
        `${API_BASE_URL}/items/assets_and_equipment?filter[asset_tag][_starts_with]=${encodeURIComponent(
          `${prefix}-`
        )}&fields=asset_tag&limit=-1`,
        { headers: AUTH_HEADERS, cache: "no-store" }
      );
      if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ asset_tag?: string }> };
        let maxNum = 0;
        (json.data || []).forEach((r) => {
          const tag = r.asset_tag || "";
          const numPart = Number(tag.replace(`${prefix}-`, ""));
          if (!Number.isNaN(numPart) && numPart > maxNum) {
            maxNum = numPart;
          }
        });
        return `${prefix}-${String(maxNum + 1).padStart(4, "0")}`;
      }
    } catch (err) {
      console.warn("generateAssetTag query failed:", err);
    }
  }
  return `${prefix}-${String(Math.floor(1000 + Math.random() * 9000))}`;
}

export async function checkRfidUnique(
  rfid: string,
  currentAssetId?: number
): Promise<{ unique: boolean; ownerName?: string }> {
  const trimmed = rfid.trim();
  if (!trimmed || !API_BASE_URL) return { unique: true };

  try {
    const res = await fetch(
      `${API_BASE_URL}/items/assets_and_equipment?filter[rfid_code][_eq]=${encodeURIComponent(
        trimmed
      )}&fields=id,asset_tag&limit=5`,
      { headers: AUTH_HEADERS, cache: "no-store" }
    );
    if (res.ok) {
      const json = (await res.json()) as { data?: Array<{ id: number; asset_tag?: string }> };
      const match = (json.data || []).find((a) => Number(a.id) !== Number(currentAssetId));
      if (match) {
        return { unique: false, ownerName: match.asset_tag || `Asset #${match.id}` };
      }
    }
  } catch (err) {
    console.warn("checkRfidUnique failed:", err);
  }
  return { unique: true };
}

async function resolveOrCreateItemType(typeName: string): Promise<number | null> {
  if (!API_BASE_URL || !typeName.trim()) return null;
  const trimmed = typeName.trim();
  const res = await fetch(
    `${API_BASE_URL}/items/item_type?filter[type_name][_eq]=${encodeURIComponent(trimmed)}&limit=1`,
    { headers: AUTH_HEADERS, cache: "no-store" }
  );
  if (res.ok) {
    const json = (await res.json()) as { data?: Array<{ id: number }> };
    if (json.data?.[0]?.id) return Number(json.data[0].id);
  }
  const createRes = await fetch(`${API_BASE_URL}/items/item_type`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify({ type_name: trimmed }),
  });
  if (createRes.ok) {
    const cJson = (await createRes.json()) as { data?: { id: number } };
    return cJson.data?.id ? Number(cJson.data.id) : null;
  }
  return null;
}

async function resolveOrCreateItemClassification(className: string): Promise<number | null> {
  if (!API_BASE_URL || !className.trim()) return null;
  const trimmed = className.trim();
  const res = await fetch(
    `${API_BASE_URL}/items/item_classification?filter[classification_name][_eq]=${encodeURIComponent(
      trimmed
    )}&limit=1`,
    { headers: AUTH_HEADERS, cache: "no-store" }
  );
  if (res.ok) {
    const json = (await res.json()) as { data?: Array<{ id: number }> };
    if (json.data?.[0]?.id) return Number(json.data[0].id);
  }
  const createRes = await fetch(`${API_BASE_URL}/items/item_classification`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify({ classification_name: trimmed }),
  });
  if (createRes.ok) {
    const cJson = (await createRes.json()) as { data?: { id: number } };
    return cJson.data?.id ? Number(cJson.data.id) : null;
  }
  return null;
}

async function resolveOrCreateBaseItem(
  itemName: string,
  itemTypeName: string,
  classificationName: string
): Promise<number | null> {
  if (!API_BASE_URL || !itemName.trim()) return null;
  const trimmed = itemName.trim();
  const res = await fetch(
    `${API_BASE_URL}/items/items?filter[item_name][_eq]=${encodeURIComponent(trimmed)}&limit=1`,
    { headers: AUTH_HEADERS, cache: "no-store" }
  );
  if (res.ok) {
    const json = (await res.json()) as { data?: Array<{ id: number }> };
    if (json.data?.[0]?.id) return Number(json.data[0].id);
  }

  const [typeId, classId] = await Promise.all([
    resolveOrCreateItemType(itemTypeName),
    resolveOrCreateItemClassification(classificationName),
  ]);

  const createRes = await fetch(`${API_BASE_URL}/items/items`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      item_name: trimmed,
      item_type: typeId,
      item_classification: classId,
    }),
  });
  if (createRes.ok) {
    const cJson = (await createRes.json()) as { data?: { id: number } };
    return cJson.data?.id ? Number(cJson.data.id) : null;
  }
  return null;
}

export async function createAsset(body: Record<string, unknown>): Promise<AssetTableData> {
  if (!API_BASE_URL) {
    throw new Error("API_BASE_URL is not configured.");
  }

  const itemName = String(body.item_name || "").trim();
  const itemType = String(body.item_type || "General").trim();
  const classification = String(body.item_classification || "IT Equipment").trim();
  const cost = Number(body.cost_per_item ?? body.acquisition_cost ?? 0);

  if (!itemName) throw new Error("Item name is required.");

  // 1. PFRS / IAS 16: Reject Land or Building
  if (
    itemName.toLowerCase().startsWith("land") ||
    itemName.toLowerCase().startsWith("building") ||
    classification.toLowerCase().startsWith("land") ||
    classification.toLowerCase().startsWith("building")
  ) {
    throw new Error(
      "Land and buildings must be registered in a separate real-property module. This system must reject them."
    );
  }

  // 2. Capitalisation threshold from asset_settings
  const thresholdStr = await fetchGeneralSetting("capitalisation_threshold");
  const threshold = Number(thresholdStr || 15000);
  if (cost < threshold) {
    throw new Error(
      `Acquisition cost is below the ₱${threshold.toLocaleString()} threshold. Below threshold items must be expensed and cannot be registered as PPE.`
    );
  }

  // 3. RFID uniqueness check against live DB
  const rfid = String(body.rfid_code || "").trim();
  if (!rfid) {
    throw new Error("RFID Tag (EPC) is required.");
  }
  const rfidCheck = await checkRfidUnique(rfid);
  if (!rfidCheck.unique) {
    throw new Error(`RFID Tag is already in use by ${rfidCheck.ownerName}. RFID EPC is never reused.`);
  }

  // 4. Resolve lookups from DB
  const [classes, conditions, encoderId] = await Promise.all([
    fetchAssetClasses(),
    fetchConditions(),
    getDefaultUserId(),
  ]);

  const matchedClass = classes.find((c) => c.name.toLowerCase() === classification.toLowerCase());
  const conditionName = String(body.condition || "Good");
  const matchedCond = conditions.find((c) => c.condition_name.toLowerCase() === conditionName.toLowerCase());

  const assetTag = String(body.asset_tag || "").trim() || (await generateAssetTag(classification));
  const itemId = await resolveOrCreateBaseItem(itemName, itemType, classification);

  const dateAcquired = String(body.date_acquired || new Date().toISOString().split("T")[0]).split("T")[0];
  const availableForUse = String(body.available_for_use_date || dateAcquired).split("T")[0];
  if (availableForUse < dateAcquired) {
    throw new Error("Available for Use date must be on or after Date Acquired.");
  }

  const lifeYears = Number(body.life_span || 5);
  const lifeMonths = Number(body.life_months || lifeYears * 12);
  const residualValue = Number(body.residual_value || 0);
  const depMethodId =
    Number(body.depreciation_method_id) ||
    mapDepreciationMethodId(body.depreciation_method) ||
    matchedClass?.depreciation_method_id ||
    1;

  const deptId = body.department ? Number(body.department) : null;
  const empId = body.employee ? Number(body.employee) : null;

  const dbPayload: Record<string, unknown> = {
    item_id: itemId,
    item_image: body.item_image || null,
    quantity: 1,
    asset_tag: assetTag,
    rfid_code: rfid,
    barcode: String(body.barcode || "").trim() || assetTag.replace("-", ""),
    serial: String(body.serial || "").trim() || null,
    brand: String(body.brand || "").trim() || null,
    model: String(body.model || "").trim() || null,
    department: deptId,
    employee: empId,
    location: String(body.location || "").trim() || null,
    cost_per_item: cost,
    acquisition_cost: cost,
    total: cost,
    residual_value: residualValue,
    condition: matchedCond?.condition_name || conditionName,
    condition_id: matchedCond?.id || 1,
    asset_class_id: matchedClass?.id || null,
    depreciation_method_id: depMethodId,
    total_units: body.total_units ? Number(body.total_units) : null,
    units_per_year: body.units_per_year ? Number(body.units_per_year) : null,
    life_span: lifeYears,
    life_months: lifeMonths,
    date_acquired: dateAcquired,
    available_for_use_date: availableForUse,
    warranty_until: body.warranty_until ? String(body.warranty_until).split("T")[0] : null,
    security_tag: String(body.security_tag || "Deactivated"),
    invoice_no: String(body.invoice_no || "").trim() || null,
    po_no: String(body.po_no || "").trim() || null,
    remarks: String(body.remarks || "").trim() || null,
    record_status_id: 1, // Active
    is_active: 1,
    is_active_warning: Number(body.is_active_warning || 0),
    encoder: Number(body.encoder || encoderId),
    row_version: 0,
  };

  const createRes = await fetch(`${API_BASE_URL}/items/assets_and_equipment`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify(dbPayload),
  });

  const createJson = (await createRes.json().catch(() => ({}))) as { data?: DirectusRecord };
  if (!createRes.ok || !createJson.data?.id) {
    throw new Error(extractDirectusError(createJson, "Failed to save asset to database."));
  }

  const newAssetId = Number(createJson.data.id);

  // Create initial custody transfer record (is_initial = 1) per DOCX
  if (deptId) {
    await fetch(`${API_BASE_URL}/items/asset_transfers`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        asset_id: newAssetId,
        effective_date: dateAcquired,
        from_department_id: null,
        to_department_id: deptId,
        from_user_id: null,
        to_user_id: empId,
        from_location: null,
        to_location: dbPayload.location,
        condition_id: matchedCond?.id || 1,
        reason: "Initial assignment on acquisition",
        is_initial: 1,
        recorded_by: Number(body.encoder || encoderId),
      }),
    }).catch((err) => console.warn("Initial transfer insert skipped:", err));
  }

  // Create initial cost line (cost_component_id = 1 Purchase price) per DOCX
  await fetch(`${API_BASE_URL}/items/asset_cost_lines`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      asset_id: newAssetId,
      cost_component_id: 1,
      amount: cost,
      remarks: "Initial acquisition cost (IAS 16.16)",
      created_by: Number(body.encoder || encoderId),
    }),
  }).catch((err) => console.warn("Initial cost line insert skipped:", err));

  // Append audit log (1 = CREATED)
  await appendAuditLog({
    action_id: 1,
    asset_id: newAssetId,
    user_id: Number(body.encoder || encoderId),
    details: `Registered asset ${assetTag} (${itemName}) at ₱${cost.toLocaleString()}`,
  });

  const [depts, users] = await Promise.all([fetchDepartments(), fetchUsers()]);
  const deptObj = depts.find((d) => d.department_id === deptId);
  const userObj = users.find((u) => u.user_id === empId);

  return {
    id: newAssetId,
    asset_tag: assetTag,
    barcode: (dbPayload.barcode as string) || null,
    rfid_code: rfid,
    serial: (dbPayload.serial as string) || null,
    brand: (dbPayload.brand as string) || null,
    model: (dbPayload.model as string) || null,
    location: (dbPayload.location as string) || null,
    security_tag: (dbPayload.security_tag as string) || "Deactivated",
    condition: String(dbPayload.condition),
    condition_id: Number(dbPayload.condition_id),
    quantity: 1,
    cost_per_item: cost,
    acquisition_cost: cost,
    total: cost,
    residual_value: residualValue,
    projected_value: cost,
    date_acquired: dateAcquired,
    available_for_use_date: availableForUse,
    warranty_until: (dbPayload.warranty_until as string) || null,
    life_span: lifeYears,
    life_months: lifeMonths,
    record_status: "active",
    supplier_name: (body.supplier_name as string) || null,
    invoice_no: (dbPayload.invoice_no as string) || null,
    po_no: (dbPayload.po_no as string) || null,
    remarks: (dbPayload.remarks as string) || null,
    item_name: itemName,
    item_image: (dbPayload.item_image as string) || null,
    item_type_name: itemType,
    classification_name: classification,
    department: deptId,
    department_name: deptObj?.department_name || "Unassigned",
    employee: empId,
    assigned_to_name: userObj ? `${userObj.user_fname} ${userObj.user_lname}`.trim() : "Unassigned",
    item_id: itemId || newAssetId,
    encoder: Number(dbPayload.encoder),
    is_active_warning: Number(dbPayload.is_active_warning || 0),
  };
}

export async function updateAsset(body: Record<string, unknown>): Promise<AssetTableData> {
  if (!API_BASE_URL) {
    throw new Error("API_BASE_URL is not configured.");
  }

  const id = Number(body.id);
  if (!id) throw new Error("Asset ID is required.");

  const existingRes = await fetch(`${API_BASE_URL}/items/assets_and_equipment/${id}`, {
    headers: AUTH_HEADERS,
    cache: "no-store",
  });
  if (!existingRes.ok) {
    throw new Error("Asset not found in database.");
  }
  const existingJson = (await existingRes.json()) as { data?: DirectusRecord };
  const existing = existingJson.data;
  if (!existing) throw new Error("Asset not found in database.");

  const itemName = String(body.item_name || "").trim();
  const itemType = String(body.item_type || "General").trim();
  const classification = String(body.item_classification || "").trim();

  if (
    itemName.toLowerCase().startsWith("land") ||
    itemName.toLowerCase().startsWith("building") ||
    classification.toLowerCase().startsWith("land") ||
    classification.toLowerCase().startsWith("building")
  ) {
    throw new Error("Land and buildings cannot be registered in this PPE module.");
  }

  if (body.rfid_code && String(body.rfid_code).trim() !== String(existing.rfid_code || "").trim()) {
    const rfidCheck = await checkRfidUnique(String(body.rfid_code), id);
    if (!rfidCheck.unique) {
      throw new Error(`RFID Tag is already in use by ${rfidCheck.ownerName}.`);
    }
  }

  const [classes, conditions, encoderId] = await Promise.all([
    fetchAssetClasses(),
    fetchConditions(),
    getDefaultUserId(),
  ]);

  const matchedClass = classification
    ? classes.find((c) => c.name.toLowerCase() === classification.toLowerCase())
    : undefined;
  const conditionName = body.condition ? String(body.condition) : String(existing.condition || "Good");
  const matchedCond = conditions.find((c) => c.condition_name.toLowerCase() === conditionName.toLowerCase());

  let itemId = existing.item_id ? Number(existing.item_id) : null;
  if (itemName) {
    const resolvedItemId = await resolveOrCreateBaseItem(
      itemName,
      itemType,
      classification || "IT Equipment"
    );
    if (resolvedItemId) itemId = resolvedItemId;
  }

  const cost =
    body.cost_per_item !== undefined
      ? Number(body.cost_per_item)
      : Number(existing.acquisition_cost ?? existing.cost_per_item ?? 0);
  const lifeYears =
    body.life_span !== undefined ? Number(body.life_span) : Number(existing.life_span || 5);
  const lifeMonths =
    body.life_months !== undefined ? Number(body.life_months) : lifeYears * 12;

  const patchPayload: Record<string, unknown> = {
    item_id: itemId,
    asset_tag: body.asset_tag !== undefined ? String(body.asset_tag).trim() || existing.asset_tag : existing.asset_tag,
    rfid_code: body.rfid_code !== undefined ? String(body.rfid_code).trim() : existing.rfid_code,
    barcode: body.barcode !== undefined ? String(body.barcode || "").trim() || null : existing.barcode,
    serial: body.serial !== undefined ? String(body.serial || "").trim() || null : existing.serial,
    brand: body.brand !== undefined ? String(body.brand || "").trim() || null : existing.brand,
    model: body.model !== undefined ? String(body.model || "").trim() || null : existing.model,
    location: body.location !== undefined ? String(body.location || "").trim() || null : existing.location,
    department: body.department !== undefined ? (body.department ? Number(body.department) : null) : existing.department,
    employee: body.employee !== undefined ? (body.employee ? Number(body.employee) : null) : existing.employee,
    security_tag: body.security_tag !== undefined ? String(body.security_tag || "Deactivated") : existing.security_tag,
    condition: matchedCond?.condition_name || conditionName,
    condition_id: matchedCond?.id ?? existing.condition_id ?? 1,
    asset_class_id: matchedClass?.id ?? existing.asset_class_id ?? null,
    cost_per_item: cost,
    acquisition_cost: cost,
    total: cost,
    residual_value:
      body.residual_value !== undefined ? Number(body.residual_value) : Number(existing.residual_value || 0),
    life_span: lifeYears,
    life_months: lifeMonths,
    depreciation_method_id:
      body.depreciation_method !== undefined
        ? mapDepreciationMethodId(body.depreciation_method)
        : existing.depreciation_method_id ?? 1,
    total_units: body.total_units !== undefined ? (body.total_units ? Number(body.total_units) : null) : existing.total_units,
    units_per_year:
      body.units_per_year !== undefined
        ? body.units_per_year
          ? Number(body.units_per_year)
          : null
        : existing.units_per_year,
    date_acquired: body.date_acquired ? String(body.date_acquired).split("T")[0] : existing.date_acquired,
    available_for_use_date: body.available_for_use_date
      ? String(body.available_for_use_date).split("T")[0]
      : existing.available_for_use_date,
    warranty_until:
      body.warranty_until !== undefined
        ? body.warranty_until
          ? String(body.warranty_until).split("T")[0]
          : null
        : existing.warranty_until,
    invoice_no: body.invoice_no !== undefined ? String(body.invoice_no || "").trim() || null : existing.invoice_no,
    po_no: body.po_no !== undefined ? String(body.po_no || "").trim() || null : existing.po_no,
    remarks: body.remarks !== undefined ? String(body.remarks || "").trim() || null : existing.remarks,
    item_image: body.item_image !== undefined ? body.item_image : existing.item_image,
    row_version: Number(existing.row_version || 0) + 1,
  };

  const patchRes = await fetch(`${API_BASE_URL}/items/assets_and_equipment/${id}`, {
    method: "PATCH",
    headers: AUTH_HEADERS,
    body: JSON.stringify(patchPayload),
  });

  const patchJson = (await patchRes.json().catch(() => ({}))) as { data?: DirectusRecord };
  if (!patchRes.ok) {
    throw new Error(extractDirectusError(patchJson, "Failed to update asset in database."));
  }

  // Append audit log (2 = EDITED)
  await appendAuditLog({
    action_id: 2,
    asset_id: id,
    user_id: encoderId,
    details: `Updated asset ${patchPayload.asset_tag || `#${id}`} (${itemName || "Asset"})`,
  });

  const allAssets = await fetchAssets();
  const refreshed = allAssets.find((a) => a.id === id);
  if (!refreshed) {
    throw new Error("Asset updated, but failed to reload refreshed record.");
  }
  return refreshed;
}

export async function deactivateAsset(id: number, reason?: string): Promise<boolean> {
  if (!API_BASE_URL) {
    throw new Error("API_BASE_URL is not configured.");
  }

  const encoderId = await getDefaultUserId();
  const patchRes = await fetch(`${API_BASE_URL}/items/assets_and_equipment/${id}`, {
    method: "PATCH",
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      record_status_id: 2, // Voided
      is_active: 0,
      deactivation_reason_id: 1, // Registered in error (default)
      deactivated_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      deactivated_by: encoderId,
      remarks: reason || "Deactivated from asset register",
    }),
  });

  if (!patchRes.ok) {
    const errJson = await patchRes.json().catch(() => ({}));
    throw new Error(extractDirectusError(errJson, "Failed to deactivate asset in database."));
  }

  // Append audit log (15 = DEACTIVATED)
  await appendAuditLog({
    action_id: 15,
    asset_id: id,
    user_id: encoderId,
    details: `Deactivated asset #${id}. Reason: ${reason || "Deactivated from register"}`,
  });

  return true;
}

export async function recordTransfer(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!API_BASE_URL) {
    throw new Error("API_BASE_URL is not configured.");
  }

  const assetId = Number(body.asset_id);
  if (!assetId) throw new Error("asset_id is required.");

  const existingRes = await fetch(`${API_BASE_URL}/items/assets_and_equipment/${assetId}`, {
    headers: AUTH_HEADERS,
    cache: "no-store",
  });
  if (!existingRes.ok) throw new Error("Asset not found in database.");
  const existingJson = (await existingRes.json()) as { data?: DirectusRecord };
  const existing = existingJson.data;
  if (!existing) throw new Error("Asset not found in database.");

  const effectiveDate = String(body.effective_date || new Date().toISOString().split("T")[0]).split("T")[0];
  const acquiredDate = String(existing.date_acquired || "").split("T")[0];
  if (acquiredDate && effectiveDate < acquiredDate) {
    throw new Error("Effective date cannot be earlier than acquisition date.");
  }

  const newDeptId = Number(body.to_department_id);
  if (!newDeptId) throw new Error("Target department is required.");

  const newUserId = body.to_user_id ? Number(body.to_user_id) : null;
  const newLocation = String(body.to_location || "").trim() || null;
  const newCondition = String(body.condition_on_handover || existing.condition || "Good");
  const reason = String(body.reason || "").trim();
  if (!reason) throw new Error("Transfer reason is required.");

  const deptChanged = Number(existing.department || 0) !== newDeptId;
  const userChanged = (existing.employee ? Number(existing.employee) : null) !== newUserId;
  const locChanged = (String(existing.location || "").trim() || null) !== newLocation;
  const condChanged = String(existing.condition || "Good") !== newCondition;

  if (!deptChanged && !userChanged && !locChanged && !condChanged) {
    throw new Error("No changes detected. A transfer must change department, holder, location, or condition.");
  }

  const [conditions, recorderId] = await Promise.all([fetchConditions(), getDefaultUserId()]);
  const matchedCond = conditions.find((c) => c.condition_name.toLowerCase() === newCondition.toLowerCase());

  // 1. Insert into asset_transfers
  const transferPayload = {
    asset_id: assetId,
    effective_date: effectiveDate,
    from_department_id: existing.department ? Number(existing.department) : null,
    to_department_id: newDeptId,
    from_user_id: existing.employee ? Number(existing.employee) : null,
    to_user_id: newUserId,
    from_location: existing.location ? String(existing.location) : null,
    to_location: newLocation,
    condition_id: matchedCond?.id ?? existing.condition_id ?? 1,
    reason,
    is_initial: 0,
    recorded_by: recorderId,
  };

  const transferRes = await fetch(`${API_BASE_URL}/items/asset_transfers`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify(transferPayload),
  });
  const transferJson = (await transferRes.json().catch(() => ({}))) as { data?: DirectusRecord };
  if (!transferRes.ok) {
    throw new Error(extractDirectusError(transferJson, "Failed to record custody transfer in database."));
  }

  // 2. Sync current holder/department/location/condition on assets_and_equipment
  const assetPatchRes = await fetch(`${API_BASE_URL}/items/assets_and_equipment/${assetId}`, {
    method: "PATCH",
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      department: newDeptId,
      employee: newUserId,
      location: newLocation,
      condition: matchedCond?.condition_name || newCondition,
      condition_id: matchedCond?.id ?? existing.condition_id ?? 1,
      row_version: Number(existing.row_version || 0) + 1,
    }),
  });
  if (!assetPatchRes.ok) {
    const errJson = await assetPatchRes.json().catch(() => ({}));
    throw new Error(extractDirectusError(errJson, "Transfer logged, but failed to update asset custody."));
  }

  // 3. Append audit log (3 = TRANSFERRED)
  await appendAuditLog({
    action_id: 3,
    asset_id: assetId,
    user_id: recorderId,
    details: `Transferred asset #${assetId} effective ${effectiveDate}. Reason: ${reason}`,
  });

  return {
    success: true,
    transfer: transferJson.data,
  };
}

export async function fetchAssetAssignments(assetId: number): Promise<Record<string, unknown>[]> {
  if (!API_BASE_URL) return [];
  const [res, users] = await Promise.all([
    fetch(`${API_BASE_URL}/items/asset_assignments?filter[asset_id][_eq]=${assetId}&sort=-id`, {
      headers: AUTH_HEADERS,
      cache: "no-store",
    }),
    fetchUsers(),
  ]);
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: DirectusRecord[] };
  const userMap = new Map<number, string>();
  users.forEach((u) => userMap.set(u.user_id, `${u.user_fname} ${u.user_lname}`.trim()));

  return (json.data || []).map((row) => ({
    ...row,
    assignment_id: Number(row.assignment_id ?? row.id),
    user_name: row.user_id ? userMap.get(Number(row.user_id)) || "Unassigned" : "Unassigned",
    assigned_by_name: row.assigned_by ? userMap.get(Number(row.assigned_by)) || "Admin" : "Admin",
  }));
}

export async function createAssetAssignment(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!API_BASE_URL) throw new Error("API_BASE_URL is not configured.");
  const encoderId = await getDefaultUserId();
  const payload = {
    asset_id: Number(body.asset_id),
    user_id: Number(body.user_id),
    assigned_by: Number(body.assigned_by || encoderId),
    assigned_date: new Date().toISOString().split("T")[0],
    expected_return_date: body.expected_return_date || null,
    assignment_status: body.assignment_status || "Assigned",
    assignment_status_id: 1,
    condition_on_assignment: body.condition_on_assignment || "Good",
    notes: body.notes || null,
  };

  const res = await fetch(`${API_BASE_URL}/items/asset_assignments`, {
    method: "POST",
    headers: AUTH_HEADERS,
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: DirectusRecord };
  if (!res.ok) {
    throw new Error(extractDirectusError(json, "Failed to save asset assignment."));
  }

  // Sync employee on assets_and_equipment
  await fetch(`${API_BASE_URL}/items/assets_and_equipment/${payload.asset_id}`, {
    method: "PATCH",
    headers: AUTH_HEADERS,
    body: JSON.stringify({ employee: payload.user_id }),
  }).catch(() => {});

  return { success: true, data: json.data };
}

export async function returnAssetAssignment(
  assignmentId: number,
  updateData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!API_BASE_URL) throw new Error("API_BASE_URL is not configured.");
  const statusMap: Record<string, number> = {
    Assigned: 1,
    Returned: 2,
    Lost: 3,
    Damaged: 4,
  };
  const statusStr = String(updateData.assignment_status || "Returned");

  const res = await fetch(`${API_BASE_URL}/items/asset_assignments/${assignmentId}`, {
    method: "PATCH",
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      actual_return_date: updateData.actual_return_date || new Date().toISOString().split("T")[0],
      condition_on_return: updateData.condition_on_return || "Good",
      assignment_status: statusStr,
      assignment_status_id: statusMap[statusStr] || 2,
      notes: updateData.notes || null,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: DirectusRecord };
  if (!res.ok) {
    throw new Error(extractDirectusError(json, "Failed to update asset return."));
  }
  return { success: true, data: json.data };
}
