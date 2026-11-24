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

// Fallback dummy data in case external directus is offline during development
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
  { id: 1, condition_name: "New", is_impairment_indicator: 0, sort_order: 1 },
  { id: 2, condition_name: "Good", is_impairment_indicator: 0, sort_order: 2 },
  { id: 3, condition_name: "Under Maintenance", is_impairment_indicator: 0, sort_order: 3 },
  { id: 4, condition_name: "Discontinued", is_impairment_indicator: 1, sort_order: 4 },
  { id: 5, condition_name: "Poor", is_impairment_indicator: 1, sort_order: 5 },
  { id: 6, condition_name: "Damaged", is_impairment_indicator: 1, sort_order: 6 },
  { id: 7, condition_name: "For repair", is_impairment_indicator: 1, sort_order: 7 },
  { id: 8, condition_name: "Bad", is_impairment_indicator: 1, sort_order: 8 },
];

let fallbackAssets: AssetTableData[] = [
  {
    id: 1,
    asset_tag: "ITE-0007",
    item_id: 101,
    item_name: "Monitor",
    item_type_name: "Hardware",
    classification_name: "IT Equipment",
    department: 1,
    department_name: "IT",
    employee: 1,
    assigned_to_name: "Maria Santos",
    condition: "New",
    condition_id: 1,
    quantity: 1,
    cost_per_item: 18500.0,
    total: 18500.0,
    residual_value: 0,
    projected_value: 17575.01,
    date_acquired: "2026-09-02",
    available_for_use_date: "2026-09-02",
    life_span: 3,
    rfid_code: "EPC-ITE-0007",
    barcode: "ITE0007",
    serial: "SN-MON-991",
    brand: "Dell",
    model: "UltraSharp 27",
    record_status: "active",
    is_active_warning: 0,
    item_image: null,
    encoder: 133,
  },
  {
    id: 2,
    asset_tag: "ITE-0008",
    item_id: 101,
    item_name: "Monitor",
    item_type_name: "Hardware",
    classification_name: "IT Equipment",
    department: 1,
    department_name: "IT",
    employee: 2,
    assigned_to_name: "Paolo Reyes",
    condition: "New",
    condition_id: 1,
    quantity: 1,
    cost_per_item: 18500.0,
    total: 18500.0,
    residual_value: 0,
    projected_value: 17575.01,
    date_acquired: "2026-09-02",
    available_for_use_date: "2026-09-02",
    life_span: 3,
    rfid_code: "EPC-ITE-0008",
    barcode: "ITE0008",
    serial: "SN-MON-992",
    brand: "Dell",
    model: "UltraSharp 27",
    record_status: "active",
    is_active_warning: 0,
    item_image: null,
    encoder: 133,
  },
  {
    id: 3,
    asset_tag: "ITE-0009",
    item_id: 101,
    item_name: "Monitor",
    item_type_name: "Hardware",
    classification_name: "IT Equipment",
    department: 2,
    department_name: "Human Resources",
    employee: 3,
    assigned_to_name: "Jenny Cruz",
    condition: "New",
    condition_id: 1,
    quantity: 1,
    cost_per_item: 18500.0,
    total: 18500.0,
    residual_value: 0,
    projected_value: 17575.01,
    date_acquired: "2026-09-02",
    available_for_use_date: "2026-09-02",
    life_span: 3,
    rfid_code: "EPC-ITE-0009",
    barcode: "ITE0009",
    serial: "SN-MON-993",
    brand: "Dell",
    model: "UltraSharp 27",
    record_status: "active",
    is_active_warning: 0,
    item_image: null,
    encoder: 133,
  },
  {
    id: 4,
    asset_tag: "ITE-0010",
    item_id: 101,
    item_name: "Monitor",
    item_type_name: "Hardware",
    classification_name: "IT Equipment",
    department: 3,
    department_name: "Finance",
    employee: 4,
    assigned_to_name: "Mark Villanueva",
    condition: "New",
    condition_id: 1,
    quantity: 1,
    cost_per_item: 18500.0,
    total: 18500.0,
    residual_value: 0,
    projected_value: 17575.01,
    date_acquired: "2026-09-02",
    available_for_use_date: "2026-09-02",
    life_span: 3,
    rfid_code: "EPC-ITE-0010",
    barcode: "ITE0010",
    serial: "SN-MON-994",
    brand: "Dell",
    model: "UltraSharp 27",
    record_status: "active",
    is_active_warning: 0,
    item_image: null,
    encoder: 133,
  },
  {
    id: 5,
    asset_tag: "ITE-0011",
    item_id: 101,
    item_name: "Monitor",
    item_type_name: "Hardware",
    classification_name: "IT Equipment",
    department: 4,
    department_name: "Unassigned",
    employee: null,
    assigned_to_name: "Unassigned",
    condition: "New",
    condition_id: 1,
    quantity: 1,
    cost_per_item: 18500.0,
    total: 18500.0,
    residual_value: 0,
    projected_value: 17575.01,
    date_acquired: "2026-09-02",
    available_for_use_date: "2026-09-02",
    life_span: 3,
    rfid_code: "EPC-ITE-0011",
    barcode: "ITE0011",
    serial: "SN-MON-995",
    brand: "Dell",
    model: "UltraSharp 27",
    record_status: "active",
    is_active_warning: 0,
    item_image: null,
    encoder: 133,
  },
  {
    id: 6,
    asset_tag: "ITE-0012",
    item_id: 102,
    item_name: "iPhone 15",
    item_type_name: "Mobile",
    classification_name: "IT Equipment",
    department: 4,
    department_name: "Admin",
    employee: 5,
    assigned_to_name: "Ana Bautista",
    condition: "Good",
    condition_id: 2,
    quantity: 1,
    cost_per_item: 52990.0,
    total: 52990.0,
    residual_value: 0,
    projected_value: 46324.7,
    date_acquired: "2026-07-08",
    available_for_use_date: "2026-07-08",
    life_span: 3,
    rfid_code: "EPC-ITE-0012",
    barcode: "ITE0012",
    serial: "APPL-IP15-01",
    brand: "Apple",
    model: "iPhone 15 128GB",
    record_status: "active",
    is_active_warning: 0,
    item_image: null,
    encoder: 133,
  },
  {
    id: 7,
    asset_tag: "FUR-0002",
    item_id: 103,
    item_name: "Ergonomic office chair",
    item_type_name: "Furniture",
    classification_name: "Furniture & Fixtures",
    department: 3,
    department_name: "Finance",
    employee: 4,
    assigned_to_name: "Mark Villanueva",
    condition: "Good",
    condition_id: 2,
    quantity: 1,
    cost_per_item: 18900.0,
    total: 18900.0,
    residual_value: 0,
    projected_value: 16114.23,
    date_acquired: "2025-11-03",
    available_for_use_date: "2025-11-03",
    life_span: 5,
    rfid_code: "EPC-FUR-0002",
    barcode: "FUR0002",
    serial: "SN-CHR-002",
    brand: "ErgoComfort",
    model: "MeshPro V2",
    record_status: "active",
    is_active_warning: 0,
    item_image: null,
    encoder: 133,
  },
];

export async function fetchAssets(): Promise<AssetTableData[]> {
  try {
    if (!API_BASE_URL) return fallbackAssets;
    const res = await fetch(`${API_BASE_URL}/items/assets_and_equipment?limit=-1&sort=-id`, {
      headers: AUTH_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return fallbackAssets;
    const json = await res.json();
    if (!json.data || json.data.length === 0) return fallbackAssets;
    
    // Process items if directus returned data
    return json.data.map((item: Record<string, unknown>, idx: number) => ({
      id: item.id || idx + 1,
      asset_tag: item.asset_tag || `AST-${String(item.id || idx + 1).padStart(4, "0")}`,
      barcode: item.barcode || null,
      rfid_code: item.rfid_code || null,
      serial: item.serial || null,
      brand: item.brand || null,
      model: item.model || null,
      location: item.location || null,
      condition: item.condition || "Good",
      condition_id: item.condition_id || 2,
      quantity: 1,
      cost_per_item: Number(item.cost_per_item || item.acquisition_cost || 0),
      total: Number(item.cost_per_item || item.acquisition_cost || 0),
      projected_value: Number(item.projected_value || item.cost_per_item || 0),
      date_acquired: item.date_acquired || new Date().toISOString().split("T")[0],
      available_for_use_date: item.available_for_use_date || item.date_acquired,
      life_span: Number(item.life_span || 5),
      item_name: item.item_name || "Asset Item",
      item_image: item.item_image || null,
      item_type_name: item.item_type_name || "General",
      classification_name: item.classification_name || "IT Equipment",
      department: item.department || null,
      department_name: item.department_name || "Unassigned",
      employee: item.employee || null,
      assigned_to_name: item.assigned_to_name || "Unassigned",
      record_status: item.record_status || "active",
      item_id: item.item_id || item.id,
      encoder: item.encoder || 133,
      is_active_warning: 0,
    }));
  } catch (err) {
    console.warn("fetchAssets using fallback data:", err);
    return fallbackAssets;
  }
}

export async function fetchDepartments(): Promise<Department[]> {
  try {
    if (!API_BASE_URL) return FALLBACK_DEPARTMENTS;
    const res = await fetch(`${API_BASE_URL}/items/department?limit=-1`, { headers: AUTH_HEADERS });
    if (!res.ok) return FALLBACK_DEPARTMENTS;
    const json = await res.json();
    return json.data || FALLBACK_DEPARTMENTS;
  } catch {
    return FALLBACK_DEPARTMENTS;
  }
}

export async function fetchUsers(): Promise<User[]> {
  try {
    if (!API_BASE_URL) return FALLBACK_USERS;
    const res = await fetch(`${API_BASE_URL}/items/user?limit=-1`, { headers: AUTH_HEADERS });
    if (!res.ok) return FALLBACK_USERS;
    const json = await res.json();
    return json.data || FALLBACK_USERS;
  } catch {
    return FALLBACK_USERS;
  }
}

export async function fetchAssetClasses(): Promise<AssetClass[]> {
  try {
    if (!API_BASE_URL) return FALLBACK_CLASSES;
    const res = await fetch(`${API_BASE_URL}/items/asset_classes?limit=-1`, { headers: AUTH_HEADERS });
    if (!res.ok) return FALLBACK_CLASSES;
    const json = await res.json();
    return json.data?.length ? json.data : FALLBACK_CLASSES;
  } catch {
    return FALLBACK_CLASSES;
  }
}

export async function fetchConditions(): Promise<AssetCondition[]> {
  try {
    if (!API_BASE_URL) return FALLBACK_CONDITIONS;
    const res = await fetch(`${API_BASE_URL}/items/asset_conditions?limit=-1`, { headers: AUTH_HEADERS });
    if (!res.ok) return FALLBACK_CONDITIONS;
    const json = await res.json();
    return json.data?.length ? json.data : FALLBACK_CONDITIONS;
  } catch {
    return FALLBACK_CONDITIONS;
  }
}

export async function fetchItemTypes(): Promise<ItemType[]> {
  return [
    { id: 1, type_name: "Hardware" },
    { id: 2, type_name: "Mobile" },
    { id: 3, type_name: "Furniture" },
    { id: 4, type_name: "Machinery" },
    { id: 5, type_name: "Vehicle" },
  ];
}

export async function fetchItemClassifications(): Promise<ItemClassification[]> {
  return FALLBACK_CLASSES.map((c) => ({
    id: c.id,
    classification_name: c.name,
    tag_prefix: c.tag_prefix,
    default_life_months: c.default_life_months,
    residual_percent: c.residual_percent,
    depreciation_method_id: c.depreciation_method_id,
  }));
}

export async function fetchItems() {
  return [
    { id: 101, item_name: "Monitor", item_type: { type_name: "Hardware" }, item_classification: { classification_name: "IT Equipment" }, brand: "Dell", model: "UltraSharp 27", default_cost: 18500, default_life: 3 },
    { id: 102, item_name: "iPhone 15", item_type: { type_name: "Mobile" }, item_classification: { classification_name: "IT Equipment" }, brand: "Apple", model: "iPhone 15 128GB", default_cost: 52990, default_life: 3 },
    { id: 103, item_name: "Ergonomic office chair", item_type: { type_name: "Furniture" }, item_classification: { classification_name: "Furniture & Fixtures" }, brand: "ErgoComfort", model: "MeshPro V2", default_cost: 18900, default_life: 5 },
    { id: 104, item_name: "MacBook Pro 16", item_type: { type_name: "Hardware" }, item_classification: { classification_name: "IT Equipment" }, brand: "Apple", model: "M3 Pro", default_cost: 139990, default_life: 4 },
  ];
}

export async function fetchGeneralSetting(key: string): Promise<string | null> {
  if (key === "capitalisation_threshold") return "15000";
  if (key === "approval_threshold") return "50000";
  if (key === "rfid_asset_tagging") return "1";
  return null;
}

export async function generateAssetTag(classificationName: string): Promise<string> {
  const cls = FALLBACK_CLASSES.find(
    (c) => c.name.toLowerCase() === classificationName.toLowerCase()
  );
  const prefix = cls?.tag_prefix || classificationName.slice(0, 3).toUpperCase();
  const existingMatches = fallbackAssets.filter((a) =>
    a.asset_tag?.startsWith(`${prefix}-`)
  );
  const nextNum = existingMatches.length + 1;
  return `${prefix}-${String(nextNum).padStart(4, "0")}`;
}

export async function checkRfidUnique(rfid: string, currentAssetId?: number): Promise<{ unique: boolean; ownerName?: string }> {
  const match = fallbackAssets.find(
    (a) => a.rfid_code?.trim().toLowerCase() === rfid.trim().toLowerCase() && a.id !== currentAssetId
  );
  if (match) {
    return { unique: false, ownerName: `${match.asset_tag || "Asset"} (${match.item_name})` };
  }
  return { unique: true };
}

export async function createAsset(body: Record<string, unknown>): Promise<AssetTableData> {
  // PFRS / IAS 16 validations
  const itemName = String(body.item_name || "").trim();
  const classification = String(body.item_classification || "").trim();
  const cost = Number(body.cost_per_item || body.acquisition_cost || 0);

  // Reject Land or Building
  if (itemName.toLowerCase().startsWith("land") || itemName.toLowerCase().startsWith("building") ||
      classification.toLowerCase().startsWith("land") || classification.toLowerCase().startsWith("building")) {
    throw new Error("Land and buildings must be registered in a separate real-property module. This system must reject them.");
  }

  // Capitalisation threshold validation
  if (cost < 15000) {
    throw new Error("Acquisition cost is below the ₱15,000 threshold. Below threshold items must be expensed and cannot be registered as PPE.");
  }

  // RFID uniqueness check
  const rfid = String(body.rfid_code || "").trim();
  if (!rfid) {
    throw new Error("RFID Tag (EPC) is required.");
  }
  const rfidCheck = await checkRfidUnique(rfid);
  if (!rfidCheck.unique) {
    throw new Error(`RFID Tag is already in use by ${rfidCheck.ownerName}. RFID EPC is never reused.`);
  }

  // Determine Tag
  const assetTag = (body.asset_tag as string) || (await generateAssetTag(classification));

  // Calculate depreciable amount and live projected value
  const residual = Number(body.residual_value || 0);

  const newId = (fallbackAssets.length > 0 ? Math.max(...fallbackAssets.map(a => a.id)) : 0) + 1;

  const departmentObj = FALLBACK_DEPARTMENTS.find(d => d.department_id === Number(body.department));
  const userObj = FALLBACK_USERS.find(u => u.user_id === Number(body.employee));

  const newAsset: AssetTableData = {
    id: newId,
    asset_tag: assetTag,
    barcode: (body.barcode as string) || assetTag.replace("-", ""),
    rfid_code: rfid,
    serial: (body.serial as string) || null,
    brand: (body.brand as string) || null,
    model: (body.model as string) || null,
    location: (body.location as string) || null,
    security_tag: (body.security_tag as string) || null,
    condition: (body.condition as string) || "Good",
    quantity: 1,
    cost_per_item: cost,
    acquisition_cost: cost,
    total: cost,
    residual_value: residual,
    projected_value: cost, // initially carrying amount = cost
    date_acquired: (body.date_acquired as string) || new Date().toISOString().split("T")[0],
    available_for_use_date: (body.available_for_use_date as string) || (body.date_acquired as string),
    warranty_until: (body.warranty_until as string) || null,
    life_span: Number(body.life_span || 5),
    record_status: "active",
    supplier_name: (body.supplier_name as string) || null,
    invoice_no: (body.invoice_no as string) || null,
    po_no: (body.po_no as string) || null,
    remarks: (body.remarks as string) || null,
    item_name: itemName,
    item_image: (body.item_image as string) || null,
    item_type_name: typeof body.item_type === "string" ? body.item_type : "Hardware",
    classification_name: classification,
    department: Number(body.department) || null,
    department_name: departmentObj?.department_name || "Unassigned",
    employee: body.employee ? Number(body.employee) : null,
    assigned_to_name: userObj ? `${userObj.user_fname} ${userObj.user_lname}` : "Unassigned",
    item_id: newId + 100,
    encoder: 133,
    is_active_warning: 0,
  };

  fallbackAssets = [newAsset, ...fallbackAssets];
  return newAsset;
}

export async function updateAsset(body: Record<string, unknown>): Promise<AssetTableData> {
  const assetIndex = fallbackAssets.findIndex(a => a.id === Number(body.id));
  if (assetIndex === -1) {
    throw new Error("Asset not found");
  }

  const existing = fallbackAssets[assetIndex];
  
  // Note: Department, Assigned To, and Location cannot be updated directly per PFRS rules (Transfer only)
  const updatedAsset: AssetTableData = {
    ...existing,
    item_name: (body.item_name as string) || existing.item_name,
    serial: body.serial !== undefined ? (body.serial as string) : existing.serial,
    brand: body.brand !== undefined ? (body.brand as string) : existing.brand,
    model: body.model !== undefined ? (body.model as string) : existing.model,
    security_tag: body.security_tag !== undefined ? (body.security_tag as string) : existing.security_tag,
    supplier_name: body.supplier_name !== undefined ? (body.supplier_name as string) : existing.supplier_name,
    invoice_no: body.invoice_no !== undefined ? (body.invoice_no as string) : existing.invoice_no,
    po_no: body.po_no !== undefined ? (body.po_no as string) : existing.po_no,
    remarks: body.remarks !== undefined ? (body.remarks as string) : existing.remarks,
    warranty_until: body.warranty_until !== undefined ? (body.warranty_until as string) : existing.warranty_until,
    item_image: body.item_image !== undefined ? (body.item_image as string) : existing.item_image,
    condition: (body.condition as string) || existing.condition,
  };

  fallbackAssets[assetIndex] = updatedAsset;
  return updatedAsset;
}

export async function deactivateAsset(id: number, reason?: string): Promise<boolean> {
  const assetIndex = fallbackAssets.findIndex(a => a.id === id);
  if (assetIndex === -1) throw new Error("Asset not found");
  
  // Rule: In use with posted periods cannot be voided, must dispose
  fallbackAssets[assetIndex] = {
    ...fallbackAssets[assetIndex],
    record_status: "voided",
    remarks: reason || fallbackAssets[assetIndex].remarks,
  };
  return true;
}

export async function recordTransfer(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const assetId = Number(body.asset_id);
  const assetIndex = fallbackAssets.findIndex((a) => a.id === assetId);
  if (assetIndex === -1) throw new Error("Asset not found");

  const existing = fallbackAssets[assetIndex];

  // Validation rules from Section 14:
  // 1. effective_date >= acquisition date
  if (new Date(String(body.effective_date)) < new Date(existing.date_acquired)) {
    throw new Error("Effective date cannot be earlier than acquisition date.");
  }

  // 2. Something must actually change
  const newDeptId = Number(body.to_department_id);
  const newUserId = body.to_user_id ? Number(body.to_user_id) : null;
  const newLocation = (body.to_location as string) || "";
  const newCondition = (body.condition_on_handover as string) || existing.condition;

  const deptChanged = existing.department !== newDeptId;
  const userChanged = existing.employee !== newUserId;
  const locChanged = (existing.location || "") !== newLocation;
  const condChanged = existing.condition !== newCondition;

  if (!deptChanged && !userChanged && !locChanged && !condChanged) {
    throw new Error("No changes detected. A transfer must change department, holder, location, or condition.");
  }

  const deptObj = FALLBACK_DEPARTMENTS.find((d) => d.department_id === newDeptId);
  const userObj = FALLBACK_USERS.find((u) => u.user_id === newUserId);

  const updatedAsset: AssetTableData = {
    ...existing,
    department: newDeptId,
    department_name: deptObj?.department_name || existing.department_name,
    employee: newUserId,
    assigned_to_name: userObj ? `${userObj.user_fname} ${userObj.user_lname}` : "Unassigned",
    location: newLocation,
    condition: newCondition,
  };

  fallbackAssets[assetIndex] = updatedAsset;

  return {
    success: true,
    transfer: {
      id: Date.now(),
      asset_id: assetId,
      effective_date: body.effective_date,
      from_department_id: existing.department,
      to_department_id: newDeptId,
      from_user_id: existing.employee,
      to_user_id: newUserId,
      from_location: existing.location,
      to_location: newLocation,
      condition_on_handover: newCondition,
      reason: body.reason,
    },
    asset: updatedAsset,
  };
}

export async function fetchAssetAssignments(_assetId: number): Promise<Record<string, unknown>[]> {
  return [
    {
      assignment_id: 1,
      asset_id: _assetId,
      user_id: 1,
      user_name: "Maria Santos",
      assigned_by: 133,
      assigned_by_name: "Admin",
      assigned_date: "2026-09-02",
      expected_return_date: null,
      actual_return_date: null,
      assignment_status: "Assigned",
      condition_on_assignment: "New",
      condition_on_return: null,
      notes: "Initial deployment",
    },
  ];
}

export async function createAssetAssignment(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return { success: true, ...body };
}

export async function returnAssetAssignment(assignmentId: number, updateData: Record<string, unknown>): Promise<Record<string, unknown>> {
  return { success: true, assignment_id: assignmentId, ...updateData };
}
