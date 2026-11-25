import { NextResponse } from "next/server";
import {
  appendAuditLog,
  fetchConditions,
  fetchGeneralSetting,
  getDefaultUserId,
} from "@/modules/financial-management/asset-management/registration/services/asset";
import { fetchAssetById } from "@/modules/financial-management/asset-management/registration/services/assetDetailService";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

function resolveMaintenanceTypeId(typeName: string): number {
  const t = typeName.toLowerCase();
  if (t.includes("corrective") || t.includes("repair")) return 2;
  if (t.includes("inspection")) return 3;
  if (t.includes("overhaul")) return 4;
  if (t.includes("upgrade")) return 5;
  if (t.includes("calibration")) return 6;
  return 1; // Preventive
}

export async function POST(req: Request) {
  try {
    if (!API_BASE_URL) {
      return NextResponse.json({ error: "API_BASE_URL is not configured." }, { status: 500 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const assetId = Number(body.asset_id);
    const description = String(body.description || "").trim();
    const performedDate = String(body.performed_date || new Date().toISOString().split("T")[0]).split("T")[0];

    if (!assetId || !description) {
      return NextResponse.json({ error: "asset_id and description are required." }, { status: 400 });
    }

    const [asset, conditions, userId] = await Promise.all([
      fetchAssetById(assetId),
      fetchConditions(),
      getDefaultUserId(),
    ]);
    if (!asset) {
      return NextResponse.json({ error: "Asset not found in database." }, { status: 404 });
    }

    const maintTypeId = resolveMaintenanceTypeId(String(body.maintenance_type || "Preventive"));
    const warrantyCovered = Boolean(body.warranty_covered);
    const cost = warrantyCovered ? 0 : Number(body.cost || 0);
    const replacesMajorPart = Boolean(body.replaces_major_part);
    const downtimeDays = body.downtime_days !== undefined && body.downtime_days !== "" ? Number(body.downtime_days) : null;
    const conditionAfterStr = String(body.condition_after || "").trim();
    const matchedCond = conditionAfterStr
      ? conditions.find((c) => c.condition_name.toLowerCase() === conditionAfterStr.toLowerCase())
      : undefined;

    // Treatment ID per DOCX (asset_maintenance_treatments):
    // 1 = WARRANTY, 2 = NONE, 3 = EXPENSE, 4 = CAPITALISE
    let treatmentId = 3;
    if (warrantyCovered) treatmentId = 1;
    else if (cost <= 0) treatmentId = 2;
    else if (replacesMajorPart) treatmentId = 4;

    let linkedEventId: number | null = null;

    // Per DOCX & IAS 16.13: if capitalised, create a SUBSEQUENT event in asset_events (source = MAINTENANCE)
    if (treatmentId === 4 && cost > 0) {
      const [approvalEnabledStr, approvalThresholdStr] = await Promise.all([
        fetchGeneralSetting("approval_enabled"),
        fetchGeneralSetting("approval_threshold"),
      ]);
      const approvalEnabled = Number(approvalEnabledStr ?? 1) === 1;
      const approvalThreshold = Number(approvalThresholdStr ?? 50000);
      const statusId = approvalEnabled && cost >= approvalThreshold ? 1 : 2;

      const evRes = await fetch(`${API_BASE_URL}/items/asset_events`, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          asset_id: assetId,
          event_type_id: 4, // SUBSEQUENT
          event_source_id: 2, // MAINTENANCE
          event_date: performedDate,
          status_id: statusId,
          carrying_amount_before: Number(asset.projected_value ?? asset.cost_per_item ?? 0),
          impact: cost,
          amount: cost,
          capitalize: 1,
          remarks: `Capitalised maintenance: ${description}`,
          maker_id: userId,
          row_version: 0,
        }),
      });
      if (evRes.ok) {
        const evJson = (await evRes.json()) as { data?: { id?: number } };
        if (evJson.data?.id) linkedEventId = Number(evJson.data.id);
      }
    }

    const workOrderPayload = {
      asset_id: assetId,
      description,
      maintenance_type_id: maintTypeId,
      performed_date: performedDate,
      vendor: String(body.vendor || "").trim() || "In-house",
      cost,
      downtime_days: downtimeDays,
      condition_after_id: matchedCond?.id ?? null,
      warranty_covered: warrantyCovered ? 1 : 0,
      replaces_major_part: replacesMajorPart ? 1 : 0,
      treatment_id: treatmentId,
      event_id: linkedEventId,
      next_service_due: body.next_service_due ? String(body.next_service_due).split("T")[0] : null,
      logged_by: userId,
      completed_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    };

    const createRes = await fetch(`${API_BASE_URL}/items/maintenance_work_orders`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(workOrderPayload),
    });

    const createJson = (await createRes.json().catch(() => ({}))) as {
      data?: Record<string, unknown>;
      errors?: Array<{ message?: string }>;
    };
    if (!createRes.ok) {
      const msg = createJson.errors?.[0]?.message || "Failed to save maintenance log in database.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Update condition on assets_and_equipment if condition_after was selected
    if (matchedCond) {
      await fetch(`${API_BASE_URL}/items/assets_and_equipment/${assetId}`, {
        method: "PATCH",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          condition: matchedCond.condition_name,
          condition_id: matchedCond.id,
        }),
      }).catch(() => {});
    }

    // Append audit log (9 = MAINTENANCE_LOGGED)
    await appendAuditLog({
      action_id: 9,
      asset_id: assetId,
      user_id: userId,
      details: `Logged maintenance (${performedDate}): ${description} — ₱${cost.toLocaleString()}`,
    });

    return NextResponse.json({
      success: true,
      data: createJson.data,
    });
  } catch (error: unknown) {
    console.error("POST Maintenance Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
