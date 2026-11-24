import {
  AssetTableData,
  DepreciationPostingRow,
  CustodyTransferRow,
  AccountingEventRow,
  JournalEntryRow,
  AuditLogRow,
  CostLineRow,
} from "../types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

interface RawRecord {
  id?: number;
  [key: string]: unknown;
}

/**
 * Fetch a single asset by ID from assets_and_equipment table
 */
export async function fetchAssetById(id: number | string): Promise<AssetTableData | null> {
  const assetId = Number(id);
  if (!assetId) return null;

  try {
    if (!API_BASE_URL) return null;

    const [assetRes, deptsRes, usersRes, classesRes, itemsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/items/assets_and_equipment/${assetId}`, {
        headers: AUTH_HEADERS,
        cache: "no-store",
      }),
      fetch(`${API_BASE_URL}/items/department?limit=-1`, { headers: AUTH_HEADERS }),
      fetch(`${API_BASE_URL}/items/user?limit=-1`, { headers: AUTH_HEADERS }),
      fetch(`${API_BASE_URL}/items/asset_classes?limit=-1`, { headers: AUTH_HEADERS }),
      fetch(`${API_BASE_URL}/items/items?limit=-1`, { headers: AUTH_HEADERS }),
    ]);

    if (!assetRes.ok) return null;

    const assetJson = await assetRes.json();
    const item = assetJson.data as Record<string, unknown> | null;
    if (!item) return null;

    const deptsJson = deptsRes.ok ? await deptsRes.json() : { data: [] };
    const usersJson = usersRes.ok ? await usersRes.json() : { data: [] };
    const classesJson = classesRes.ok ? await classesRes.json() : { data: [] };
    const itemsJson = itemsRes.ok ? await itemsRes.json() : { data: [] };

    const depts = (deptsJson.data || []) as RawRecord[];
    const users = (usersJson.data || []) as RawRecord[];
    const classes = (classesJson.data || []) as RawRecord[];
    const itemsList = (itemsJson.data || []) as RawRecord[];

    const matchedDept = depts.find((d) => d.department_id === item.department || d.id === item.department);
    const matchedUser = users.find((u) => u.user_id === item.employee || u.id === item.employee);
    const matchedClass = classes.find((c) => c.id === item.asset_class_id || c.name === item.item_classification);
    const matchedBaseItem = itemsList.find((i) => i.id === item.item_id);

    return {
      id: Number(item.id),
      asset_tag: (item.asset_tag as string) || `AST-${String(item.id).padStart(4, "0")}`,
      barcode: (item.barcode as string) || null,
      rfid_code: (item.rfid_code as string) || (item.rfid_key as string) || null,
      serial: (item.serial as string) || null,
      brand: (item.brand as string) || null,
      model: (item.model as string) || null,
      location: (item.location as string) || null,
      security_tag: (item.security_tag as string) || "Deactivated",
      condition: (item.condition as string) || "Good",
      condition_id: item.condition_id as number | undefined,
      quantity: 1,
      cost_per_item: Number(item.cost_per_item || item.acquisition_cost || 0),
      acquisition_cost: Number(item.acquisition_cost || item.cost_per_item || 0),
      total: Number(item.cost_per_item || item.acquisition_cost || 0),
      residual_value: Number(item.residual_value || 0),
      projected_value: Number(item.carrying_amount || item.projected_value || item.cost_per_item || 0),
      date_acquired: (item.date_acquired as string) || "",
      available_for_use_date: (item.available_for_use_date as string) || (item.date_acquired as string) || "",
      warranty_until: (item.warranty_until as string) || null,
      life_span: Number(item.life_span || (Number(item.life_months) ? Number(item.life_months) / 12 : 5)),
      life_months: Number(item.life_months) || (Number(item.life_span) ? Number(item.life_span) * 12 : 60),
      record_status: (item.record_status as "active" | "voided" | "archived") || "active",
      supplier_name: (item.supplier_name as string) || null,
      invoice_no: (item.invoice_no as string) || null,
      po_no: (item.po_no as string) || null,
      remarks: (item.remarks as string) || null,
      item_name: (matchedBaseItem?.item_name as string) || (item.item_name as string) || "Asset Item",
      item_image: (item.item_image as string) || null,
      item_type_name: (item.item_type as string) || (matchedBaseItem?.item_type as string) || "General",
      classification_name: (matchedClass?.name as string) || (item.item_classification as string) || "IT Equipment",
      department: (item.department as number) || null,
      department_name: (matchedDept?.department_name as string) || "Unassigned",
      employee: (item.employee as number) || null,
      assigned_to_name: matchedUser ? `${matchedUser.user_fname} ${matchedUser.user_lname}`.trim() : "Unassigned",
      item_id: (item.item_id as number) || Number(item.id),
      encoder: (item.encoder as number) || 133,
      is_active_warning: (item.is_active_warning as number) || 0,
    };
  } catch (error) {
    console.error("fetchAssetById error:", error);
    return null;
  }
}

/**
 * Fetch real depreciation schedule from asset_depreciation_postings
 */
export async function fetchDepreciationPostings(assetId: number | string): Promise<DepreciationPostingRow[]> {
  try {
    if (!API_BASE_URL) return [];
    const res = await fetch(
      `${API_BASE_URL}/items/asset_depreciation_postings?filter[asset_id][_eq]=${assetId}&sort=period`,
      { headers: AUTH_HEADERS, cache: "no-store" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []) as DepreciationPostingRow[];
  } catch {
    return [];
  }
}

/**
 * Fetch real custody transfers from asset_transfers
 */
export async function fetchAssetTransfers(assetId: number | string): Promise<CustodyTransferRow[]> {
  try {
    if (!API_BASE_URL) return [];
    const res = await fetch(
      `${API_BASE_URL}/items/asset_transfers?filter[asset_id][_eq]=${assetId}&sort=-effective_date`,
      { headers: AUTH_HEADERS, cache: "no-store" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []) as CustodyTransferRow[];
  } catch {
    return [];
  }
}

/**
 * Fetch real accounting events from asset_events
 */
export async function fetchAssetEvents(assetId: number | string): Promise<AccountingEventRow[]> {
  try {
    if (!API_BASE_URL) return [];
    const res = await fetch(
      `${API_BASE_URL}/items/asset_events?filter[asset_id][_eq]=${assetId}&sort=-event_date`,
      { headers: AUTH_HEADERS, cache: "no-store" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []) as AccountingEventRow[];
  } catch {
    return [];
  }
}

/**
 * Fetch real journal entries and lines from asset_journal_entries & lines
 */
export async function fetchAssetJournals(assetId: number | string): Promise<JournalEntryRow[]> {
  try {
    if (!API_BASE_URL) return [];
    const res = await fetch(
      `${API_BASE_URL}/items/asset_journal_entries?filter[asset_id][_eq]=${assetId}&fields=*,lines.*&sort=entry_date`,
      { headers: AUTH_HEADERS, cache: "no-store" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []) as JournalEntryRow[];
  } catch {
    return [];
  }
}

/**
 * Fetch real audit log from asset_audit_log
 */
export async function fetchAssetAuditLog(assetId: number | string): Promise<AuditLogRow[]> {
  try {
    if (!API_BASE_URL) return [];
    const res = await fetch(
      `${API_BASE_URL}/items/asset_audit_log?filter[asset_id][_eq]=${assetId}&sort=-logged_at`,
      { headers: AUTH_HEADERS, cache: "no-store" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []) as AuditLogRow[];
  } catch {
    return [];
  }
}

/**
 * Fetch real cost lines from asset_cost_lines
 */
export async function fetchAssetCostLines(assetId: number | string): Promise<CostLineRow[]> {
  try {
    if (!API_BASE_URL) return [];
    const res = await fetch(
      `${API_BASE_URL}/items/asset_cost_lines?filter[asset_id][_eq]=${assetId}&fields=*,cost_component_id.*`,
      { headers: AUTH_HEADERS, cache: "no-store" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []) as CostLineRow[];
  } catch {
    return [];
  }
}
