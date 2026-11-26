import { NextResponse } from "next/server";
import {
  fetchAssets,
  fetchConditions,
  fetchDepartments,
  fetchUsers,
} from "@/modules/financial-management/asset-management/registration/services/asset";
import type {
  ClearanceActionCode,
  ClearanceAssetItem,
  EmployeeClearanceData,
  EmployeeClearanceRecord,
  EmployeeClearanceStatus,
  ProcessedClearanceLine,
} from "@/modules/financial-management/asset-management/employee-clearance/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

interface DirectusClearanceRequest {
  id: number;
  employee_id?: number | null;
  user_id?: number | null;
  status?: string | null;
  last_day?: string | null;
  effective_date?: string | null;
  reason?: string | null;
  cleared_at?: string | null;
}

interface DirectusClearanceLine {
  id: number;
  clearance_request_id: number;
  asset_id: number;
  condition_id?: number | null;
  action_id?: number | null;
  to_department_id?: number | null;
  to_user_id?: number | null;
  to_location?: string | null;
  amount_charged?: number | string | null;
  transfer_id?: number | null;
  event_id?: number | null;
  processed_by?: number | null;
  processed_at?: string | null;
  remarks?: string | null;
}

function mapActionId(actionId?: number | null): { code: ClearanceActionCode | null; label: string } {
  switch (Number(actionId)) {
    case 1:
      return { code: "RETURNED_TO_STOCK", label: "Returned to stock" };
    case 2:
      return { code: "REASSIGNED", label: "Reassigned to employee" };
    case 3:
      return { code: "LOST", label: "Not returned — lost" };
    default:
      return { code: null, label: "Pending" };
  }
}

function mapClearanceStatus(rawStatus?: string | null): EmployeeClearanceStatus {
  const s = String(rawStatus || "").toLowerCase().trim();
  if (s === "cleared" || s === "completed" || s === "approved") return "Cleared";
  return "In clearance";
}

export async function GET() {
  try {
    const [assets, users, depts, conditions] = await Promise.all([
      fetchAssets(),
      fetchUsers(),
      fetchDepartments(),
      fetchConditions(),
    ]);

    const deptMap = new Map<number, string>();
    depts.forEach((d) => deptMap.set(d.department_id, d.department_name));

    const userMap = new Map<number, string>();
    users.forEach((u) => userMap.set(u.user_id, `${u.user_fname} ${u.user_lname}`.trim()));

    const condMap = new Map<number, string>();
    conditions.forEach((c) => condMap.set(c.id, c.condition_name));

    const assetMap = new Map<number, { asset_tag: string; item_name: string }>();
    assets.forEach((a) =>
      assetMap.set(a.id, {
        asset_tag: a.asset_tag || `AST-${a.id}`,
        item_name: a.item_name || "Asset Item",
      })
    );

    // Query clearance_request and asset_clearance_lines from Directus
    const clearanceRequestsMap = new Map<
      number,
      {
        status: EmployeeClearanceStatus;
        last_day: string | null;
        reason: string | null;
        cleared_at: string | null;
        request_id: number;
      }
    >();
    const linesByRequestId = new Map<number, ProcessedClearanceLine[]>();

    if (API_BASE_URL) {
      const [crRes, linesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/items/clearance_request?fields=*&sort=-id&limit=-1`, {
          headers: AUTH_HEADERS,
          cache: "no-store",
        }).catch(() => null),
        fetch(`${API_BASE_URL}/items/asset_clearance_lines?fields=*&sort=-processed_at,-id&limit=-1`, {
          headers: AUTH_HEADERS,
          cache: "no-store",
        }).catch(() => null),
      ]);

      if (crRes && crRes.ok) {
        const json = (await crRes.json()) as { data?: DirectusClearanceRequest[] };
        if (Array.isArray(json.data)) {
          json.data.forEach((cr) => {
            const empId = Number(cr.employee_id ?? cr.user_id ?? 0);
            if (empId > 0 && !clearanceRequestsMap.has(empId)) {
              const rawDate = cr.last_day || cr.effective_date || null;
              clearanceRequestsMap.set(empId, {
                status: mapClearanceStatus(cr.status),
                last_day: rawDate ? String(rawDate).split("T")[0] : null,
                reason: cr.reason ? String(cr.reason) : null,
                cleared_at: cr.cleared_at ? String(cr.cleared_at) : null,
                request_id: Number(cr.id),
              });
            }
          });
        }
      }

      if (linesRes && linesRes.ok) {
        const linesJson = (await linesRes.json()) as { data?: DirectusClearanceLine[] };
        if (Array.isArray(linesJson.data)) {
          linesJson.data.forEach((line) => {
            const reqId = Number(line.clearance_request_id);
            if (!reqId) return;
            const assetInfo = assetMap.get(Number(line.asset_id));
            const actionInfo = mapActionId(line.action_id);
            const mapped: ProcessedClearanceLine = {
              id: Number(line.id),
              clearance_request_id: reqId,
              asset_id: Number(line.asset_id),
              asset_tag: assetInfo?.asset_tag || `AST-${line.asset_id}`,
              item_name: assetInfo?.item_name || `Asset #${line.asset_id}`,
              condition_id: line.condition_id ? Number(line.condition_id) : null,
              condition_name: line.condition_id ? condMap.get(Number(line.condition_id)) || "Good" : "—",
              action_id: line.action_id ? Number(line.action_id) : null,
              action_code: actionInfo.code,
              action_label: actionInfo.label,
              to_department_id: line.to_department_id ? Number(line.to_department_id) : null,
              to_department_name: line.to_department_id
                ? deptMap.get(Number(line.to_department_id)) || "—"
                : "—",
              to_user_id: line.to_user_id ? Number(line.to_user_id) : null,
              to_user_name: line.to_user_id ? userMap.get(Number(line.to_user_id)) || "—" : "Unassigned",
              to_location: line.to_location ? String(line.to_location) : null,
              amount_charged:
                line.amount_charged !== null && line.amount_charged !== undefined
                  ? Number(line.amount_charged)
                  : null,
              transfer_id: line.transfer_id ? Number(line.transfer_id) : null,
              event_id: line.event_id ? Number(line.event_id) : null,
              processed_by: line.processed_by ? Number(line.processed_by) : null,
              processed_at: line.processed_at ? String(line.processed_at) : null,
              remarks: line.remarks ? String(line.remarks) : null,
            };
            const list = linesByRequestId.get(reqId) || [];
            list.push(mapped);
            linesByRequestId.set(reqId, list);
          });
        }
      }
    }

    // Map active assets held by each employee
    const employeeAssetsMap = new Map<number, ClearanceAssetItem[]>();
    assets.forEach((a) => {
      if (a.employee && a.record_status === "active") {
        const empId = Number(a.employee);
        if (!employeeAssetsMap.has(empId)) {
          employeeAssetsMap.set(empId, []);
        }
        const cost = Number(a.cost_per_item || a.acquisition_cost || 0);
        const ca = Number(a.projected_value || cost);
        employeeAssetsMap.get(empId)!.push({
          id: a.id,
          asset_tag: a.asset_tag || `AST-${a.id}`,
          item_name: a.item_name || "Asset Item",
          classification_name: a.classification_name || "General",
          rfid_code: a.rfid_code || "—",
          serial: a.serial || null,
          carrying_amount: ca,
          condition: a.condition || "Good",
          condition_id: a.condition_id ?? null,
          department_id: a.department ?? null,
          location: a.location ?? null,
        });
      }
    });

    const records: EmployeeClearanceRecord[] = [];
    const activeUsers: EmployeeClearanceData["activeUsers"] = [];
    let inClearanceCount = 0;
    let clearedCount = 0;
    let totalAssetsWithPeople = 0;

    users.forEach((u) => {
      const empId = u.user_id;
      const heldAssets = employeeAssetsMap.get(empId) || [];
      const assetsCount = heldAssets.length;
      totalAssetsWithPeople += assetsCount;

      const totalCA = heldAssets.reduce((sum, item) => sum + item.carrying_amount, 0);

      let status: EmployeeClearanceStatus = "Active";
      let lastDay: string | null = null;
      let clearanceReason: string | null = null;
      let clearedAt: string | null = null;
      let reqId: number | null = null;

      if (clearanceRequestsMap.has(empId)) {
        const cr = clearanceRequestsMap.get(empId)!;
        status = cr.status;
        lastDay = cr.last_day;
        clearanceReason = cr.reason;
        clearedAt = cr.cleared_at;
        reqId = cr.request_id;
      }

      if (status === "In clearance") inClearanceCount++;
      if (status === "Cleared") clearedCount++;

      const deptName = u.department_id ? deptMap.get(u.department_id) || "General" : "Unassigned";
      const fullName = `${u.user_fname} ${u.user_lname}`.trim();

      // PDF §16: From "In clearance" onward the employee cannot be selected as a holder anywhere
      if (status === "Active") {
        activeUsers.push({
          user_id: empId,
          user_name: fullName,
          department_id: u.department_id ?? null,
          department_name: deptName,
        });
      }

      const processedLines = reqId ? linesByRequestId.get(reqId) || [] : [];

      if (assetsCount > 0 || status === "In clearance" || status === "Cleared") {
        records.push({
          employee_id: empId,
          employee_name: fullName,
          department_id: u.department_id || null,
          department_name: deptName,
          assets_held_count: assetsCount,
          total_carrying_amount: totalCA,
          status,
          last_day: lastDay,
          clearance_reason: clearanceReason,
          cleared_at: clearedAt,
          clearance_request_id: reqId,
          assets: heldAssets,
          processed_lines: processedLines,
        });
      }
    });

    // Sort: In clearance first, then Active with most assets, then Cleared
    records.sort((a, b) => {
      const rank = (s: EmployeeClearanceStatus) =>
        s === "In clearance" ? 0 : s === "Active" ? 1 : 2;
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return b.assets_held_count - a.assets_held_count;
    });

    const payload: EmployeeClearanceData = {
      kpis: {
        totalEmployees: records.length,
        inClearanceCount,
        clearedCount,
        assetsWithPeople: totalAssetsWithPeople,
      },
      employees: records,
      departments: depts.map((d) => ({
        department_id: d.department_id,
        department_name: d.department_name,
      })),
      conditions: conditions.map((c) => ({
        id: c.id,
        condition_name: c.condition_name,
      })),
      activeUsers,
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    console.error("GET /api/fm/asset-management/employee-clearance error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
