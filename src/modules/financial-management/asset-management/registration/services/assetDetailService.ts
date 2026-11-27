import {
  AssetTableData,
  DepreciationPostingRow,
  CustodyTransferRow,
  AccountingEventRow,
  JournalEntryRow,
  AuditLogRow,
  CostLineRow,
  MaintenanceLogRow,
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

async function safeDirectusList(path: string): Promise<RawRecord[]> {
  if (!API_BASE_URL) return [];
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: AUTH_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: RawRecord[] };
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

export async function fetchAssetById(id: number | string): Promise<AssetTableData | null> {
  const assetId = Number(id);
  if (!assetId || !API_BASE_URL) return null;

  try {
    const [assetRes, depts, users, classes, itemsList, itemTypes, conds] = await Promise.all([
      fetch(`${API_BASE_URL}/items/assets_and_equipment/${assetId}`, {
        headers: AUTH_HEADERS,
        cache: "no-store",
      }),
      safeDirectusList("/items/department?limit=-1"),
      safeDirectusList("/items/user?limit=-1"),
      safeDirectusList("/items/asset_classes?limit=-1"),
      safeDirectusList("/items/items?limit=-1"),
      safeDirectusList("/items/item_type?limit=-1"),
      safeDirectusList("/items/asset_conditions?limit=-1"),
    ]);

    if (!assetRes.ok) return null;

    const assetJson = (await assetRes.json()) as { data?: Record<string, unknown> | null };
    const item = assetJson.data;
    if (!item) return null;

    const matchedDept = depts.find((d) => d.department_id === item.department || d.id === item.department);
    const matchedUser = users.find((u) => u.user_id === item.employee || u.id === item.employee);
    const matchedClass = classes.find((c) => c.id === item.asset_class_id || c.name === item.item_classification);
    const matchedBaseItem = itemsList.find((i) => i.id === item.item_id);
    const matchedType = matchedBaseItem?.item_type
      ? itemTypes.find((t) => t.id === matchedBaseItem.item_type)
      : undefined;
    const matchedCond = item.condition_id
      ? conds.find((c) => c.id === item.condition_id)
      : undefined;

    let recordStatus: "active" | "voided" | "archived" = "active";
    if (Number(item.record_status_id) === 2 || item.is_active === 0) recordStatus = "voided";
    else if (Number(item.record_status_id) === 3) recordStatus = "archived";

    const cost = Number(item.acquisition_cost ?? item.cost_per_item ?? 0);
    const lifeMonths = Number(item.life_months || (Number(item.life_span) ? Number(item.life_span) * 12 : 60));

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
      condition: String(matchedCond?.name || item.condition || "Good"),
      condition_id: item.condition_id ? Number(item.condition_id) : undefined,
      quantity: 1,
      cost_per_item: cost,
      acquisition_cost: cost,
      total: Number(item.total ?? cost),
      residual_value: Number(item.residual_value || 0),
      total_units: item.total_units !== null && item.total_units !== undefined ? Number(item.total_units) : null,
      units_per_year:
        item.units_per_year !== null && item.units_per_year !== undefined ? Number(item.units_per_year) : null,
      projected_value: Number(item.carrying_amount ?? item.projected_value ?? cost),
      date_acquired: String(item.date_acquired || "").split("T")[0],
      available_for_use_date: String(item.available_for_use_date || item.date_acquired || "").split("T")[0],
      warranty_until: item.warranty_until ? String(item.warranty_until).split("T")[0] : null,
      life_span: Number(item.life_span || Math.max(1, Math.round(lifeMonths / 12))),
      life_months: lifeMonths,
      record_status: recordStatus,
      supplier_name: (item.supplier_name as string) || null,
      invoice_no: (item.invoice_no as string) || null,
      po_no: (item.po_no as string) || null,
      remarks: (item.remarks as string) || null,
      item_name: (matchedBaseItem?.item_name as string) || (item.item_name as string) || "Asset Item",
      item_image: (item.item_image as string) || null,
      item_type_name: (matchedType?.type_name as string) || "General",
      classification_name: (matchedClass?.name as string) || "IT Equipment",
      department: item.department ? Number(item.department) : null,
      department_name: (matchedDept?.department_name as string) || "Unassigned",
      employee: item.employee ? Number(item.employee) : null,
      assigned_to_name: matchedUser
        ? `${matchedUser.user_fname || ""} ${matchedUser.user_lname || ""}`.trim()
        : "Unassigned",
      item_id: Number(item.item_id || item.id),
      encoder: item.encoder ? Number(item.encoder) : 133,
      is_active_warning: Number(item.is_active_warning || 0),
    };
  } catch (error) {
    console.error("fetchAssetById error:", error);
    return null;
  }
}

export async function fetchDepreciationPostings(assetId: number | string): Promise<DepreciationPostingRow[]> {
  const rows = await safeDirectusList(
    `/items/asset_depreciation_postings?filter[asset_id][_eq]=${assetId}&sort=period`
  );
  return rows as unknown as DepreciationPostingRow[];
}

export async function fetchAssetTransfers(assetId: number | string): Promise<CustodyTransferRow[]> {
  const [rows, depts, users, conds] = await Promise.all([
    safeDirectusList(`/items/asset_transfers?filter[asset_id][_eq]=${assetId}&sort=-effective_date,-id`),
    safeDirectusList("/items/department?limit=-1"),
    safeDirectusList("/items/user?limit=-1"),
    safeDirectusList("/items/asset_conditions?limit=-1"),
  ]);

  const deptMap = new Map<number, string>();
  depts.forEach((d) => deptMap.set(Number(d.department_id ?? d.id), String(d.department_name || "")));

  const userMap = new Map<number, string>();
  users.forEach((u) => userMap.set(Number(u.user_id ?? u.id), `${u.user_fname || ""} ${u.user_lname || ""}`.trim()));

  const condMap = new Map<number, string>();
  conds.forEach((c) => condMap.set(Number(c.id), String(c.name || c.condition_name || "")));

  return rows.map((r) => ({
    id: Number(r.id),
    asset_id: Number(r.asset_id),
    effective_date: String(r.effective_date || "").split("T")[0],
    from_department_id: r.from_department_id ? Number(r.from_department_id) : undefined,
    from_department_name: r.from_department_id
      ? deptMap.get(Number(r.from_department_id)) || `Dept #${r.from_department_id}`
      : r.is_initial
      ? "— new acquisition —"
      : "—",
    to_department_id: r.to_department_id ? Number(r.to_department_id) : undefined,
    to_department_name: r.to_department_id
      ? deptMap.get(Number(r.to_department_id)) || `Dept #${r.to_department_id}`
      : "Unassigned",
    to_user_id: r.to_user_id ? Number(r.to_user_id) : undefined,
    to_user_name: r.to_user_id ? userMap.get(Number(r.to_user_id)) || "Unassigned" : "Unassigned",
    condition: r.condition_id ? condMap.get(Number(r.condition_id)) || "Good" : "Good",
    reason: String(r.reason || "Custody transfer"),
    recorded_by_name: r.recorded_by ? userMap.get(Number(r.recorded_by)) || "Property Officer" : "Property Officer",
  }));
}

export async function fetchAssetEvents(assetId: number | string): Promise<AccountingEventRow[]> {
  const [rows, eventTypes, eventStatuses] = await Promise.all([
    safeDirectusList(`/items/asset_events?filter[asset_id][_eq]=${assetId}&sort=-event_date,-id`),
    safeDirectusList("/items/asset_event_types?limit=-1"),
    safeDirectusList("/items/asset_event_statuses?limit=-1"),
  ]);

  const typeMap = new Map<number, string>();
  eventTypes.forEach((t) => typeMap.set(Number(t.id), String(t.name || t.code || "Event")));

  const statusMap = new Map<number, string>();
  eventStatuses.forEach((s) => statusMap.set(Number(s.id), String(s.name || s.code || "Pending")));

  return rows.map((r) => ({
    id: Number(r.id),
    asset_id: Number(r.asset_id),
    event_date: String(r.event_date || "").split("T")[0],
    event_type: typeMap.get(Number(r.event_type_id)) || `Event #${r.event_type_id}`,
    status: statusMap.get(Number(r.status_id)) || (Number(r.status_id) === 1 ? "Pending approval" : "Approved"),
    impact: r.impact !== null && r.impact !== undefined ? Number(r.impact) : 0,
    fvlcd: r.fvlcd !== null && r.fvlcd !== undefined ? Number(r.fvlcd) : undefined,
    viu: r.viu !== null && r.viu !== undefined ? Number(r.viu) : undefined,
    remarks: r.remarks ? String(r.remarks) : undefined,
  }));
}

export async function fetchAssetJournals(assetId: number | string): Promise<JournalEntryRow[]> {
  const rows = await safeDirectusList(
    `/items/asset_journal_entries?filter[asset_id][_eq]=${assetId}&fields=*,lines.*&sort=entry_date`
  );
  return rows as unknown as JournalEntryRow[];
}

export async function fetchAssetAuditLog(assetId: number | string): Promise<AuditLogRow[]> {
  const [rows, actions] = await Promise.all([
    safeDirectusList(`/items/asset_audit_log?filter[asset_id][_eq]=${assetId}&sort=-id`),
    safeDirectusList("/items/asset_audit_actions?limit=-1"),
  ]);

  const actionMap = new Map<number, string>();
  actions.forEach((a) => actionMap.set(Number(a.id), String(a.name || a.code || "Action")));

  return rows.map((r) => ({
    id: r.id,
    logged_at: String(r.logged_at || "").replace("T", " ").slice(0, 19),
    user_name: String(r.user_name || "System"),
    action: actionMap.get(Number(r.action_id)) || `Action #${r.action_id}`,
    details: String(r.details || ""),
  }));
}

export async function fetchAssetCostLines(assetId: number | string): Promise<CostLineRow[]> {
  const [rows, components] = await Promise.all([
    safeDirectusList(`/items/asset_cost_lines?filter[asset_id][_eq]=${assetId}`),
    safeDirectusList("/items/asset_cost_components?limit=-1"),
  ]);

  const compMap = new Map<number, string>();
  components.forEach((c) => compMap.set(Number(c.id), String(c.name || "Component")));

  return rows.map((r) => ({
    id: Number(r.id),
    component_name: compMap.get(Number(r.cost_component_id)) || "Purchase price",
    amount: Number(r.amount || 0),
    treatment: r.remarks ? String(r.remarks) : "IAS 16",
  }));
}

export async function fetchAssetMaintenanceLogs(assetId: number | string): Promise<MaintenanceLogRow[]> {
  const [rows, maintTypes, treatments, conds, users] = await Promise.all([
    safeDirectusList(`/items/maintenance_work_orders?filter[asset_id][_eq]=${assetId}&sort=-performed_date,-id`),
    safeDirectusList("/items/asset_maintenance_types?limit=-1"),
    safeDirectusList("/items/asset_maintenance_treatments?limit=-1"),
    safeDirectusList("/items/asset_conditions?limit=-1"),
    safeDirectusList("/items/user?limit=-1"),
  ]);

  const typeMap = new Map<number, string>();
  maintTypes.forEach((t) => typeMap.set(Number(t.id), String(t.name || "Maintenance")));

  const treatMap = new Map<number, string>();
  treatments.forEach((t) => treatMap.set(Number(t.id), String(t.name || "Expense")));

  const condMap = new Map<number, string>();
  conds.forEach((c) => condMap.set(Number(c.id), String(c.name || "Good")));

  const userMap = new Map<number, string>();
  users.forEach((u) => userMap.set(Number(u.user_id ?? u.id), `${u.user_fname || ""} ${u.user_lname || ""}`.trim()));

  return rows.map((r) => ({
    id: Number(r.id),
    asset_id: Number(r.asset_id),
    performed_date: String(r.performed_date || r.generated_at || "").split("T")[0],
    maintenance_type: typeMap.get(Number(r.maintenance_type_id)) || "Preventive",
    description: String(r.description || ""),
    vendor: r.vendor ? String(r.vendor) : null,
    cost: Number(r.cost || 0),
    downtime_days: r.downtime_days !== null && r.downtime_days !== undefined ? Number(r.downtime_days) : null,
    condition_after: r.condition_after_id ? condMap.get(Number(r.condition_after_id)) || null : null,
    warranty_covered: Boolean(r.warranty_covered),
    replaces_major_part: Boolean(r.replaces_major_part),
    treatment: treatMap.get(Number(r.treatment_id)) || (r.replaces_major_part ? "Capitalise" : "Expense"),
    next_service_due: r.next_service_due ? String(r.next_service_due).split("T")[0] : null,
    logged_by_name: r.logged_by ? userMap.get(Number(r.logged_by)) || "Property Officer" : "Property Officer",
  }));
}
