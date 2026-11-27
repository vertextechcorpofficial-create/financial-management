import { NextResponse } from "next/server";
import {
  appendAuditLog,
  fetchConditions,
  fetchGeneralSetting,
  fetchUsers,
  getDefaultUserId,
} from "@/modules/financial-management/asset-management/registration/services/asset";
import type { ClearanceActionCode } from "@/modules/financial-management/asset-management/employee-clearance/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

function extractError(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const obj = json as { errors?: Array<{ message?: string }>; error?: string; message?: string };
  return obj.errors?.[0]?.message || obj.error || obj.message || fallback;
}

function actionCodeToId(action: ClearanceActionCode): number {
  switch (action) {
    case "RETURNED_TO_STOCK":
      return 1;
    case "REASSIGNED":
      return 2;
    case "LOST":
      return 3;
  }
}

export async function POST(req: Request) {
  try {
    if (!API_BASE_URL) {
      return NextResponse.json({ error: "Directus API URL is not configured." }, { status: 500 });
    }

    const body = (await req.json()) as {
      employeeId?: number;
      clearanceRequestId?: number | null;
      assetId?: number;
      action?: ClearanceActionCode;
      conditionId?: number | null;
      conditionName?: string;
      toDepartmentId?: number | null;
      toUserId?: number | null;
      toLocation?: string;
      amountCharged?: number;
      reason?: string;
    };

    const employeeId = Number(body.employeeId);
    const assetId = Number(body.assetId);
    const action = body.action;

    if (!employeeId || !assetId || !action) {
      return NextResponse.json(
        { error: "Missing required clearance parameters (employeeId, assetId, action)." },
        { status: 400 }
      );
    }

    if (!["RETURNED_TO_STOCK", "REASSIGNED", "LOST"].includes(action)) {
      return NextResponse.json({ error: "Invalid clearance action." }, { status: 400 });
    }

    // 1. Fetch existing asset, lookups, latest transfer, and settings in parallel
    const [assetRes, latestTransferRes, conditions, users, recorderId, thresholdStr, approvalOnStr] =
      await Promise.all([
        fetch(`${API_BASE_URL}/items/assets_and_equipment/${assetId}`, {
          headers: AUTH_HEADERS,
          cache: "no-store",
        }),
        fetch(
          `${API_BASE_URL}/items/asset_transfers?filter[asset_id][_eq]=${assetId}&sort=-effective_date,-id&limit=1`,
          { headers: AUTH_HEADERS, cache: "no-store" }
        ),
        fetchConditions(),
        fetchUsers(),
        getDefaultUserId(),
        fetchGeneralSetting("approval_threshold"),
        fetchGeneralSetting("approval_enabled"),
      ]);

    if (!assetRes.ok) {
      return NextResponse.json({ error: "Asset not found in database." }, { status: 404 });
    }
    const assetJson = (await assetRes.json()) as { data?: Record<string, unknown> };
    const existing = assetJson.data;
    if (!existing) {
      return NextResponse.json({ error: "Asset not found in database." }, { status: 404 });
    }

    // Determine effective date: PDF §16 "dated the reporting date (or later than the latest existing transfer)"
    let effectiveDate = new Date().toISOString().split("T")[0];
    if (latestTransferRes.ok) {
      const ltJson = (await latestTransferRes.json()) as {
        data?: Array<{ effective_date?: string }>;
      };
      const latestDate = ltJson.data?.[0]?.effective_date?.split("T")[0];
      if (latestDate && latestDate > effectiveDate) {
        effectiveDate = latestDate;
      }
    }
    const acquiredDate = String(existing.date_acquired || "").split("T")[0];
    if (acquiredDate && acquiredDate > effectiveDate) {
      effectiveDate = acquiredDate;
    }

    // Resolve condition
    let resolvedCond = body.conditionId
      ? conditions.find((c) => c.id === Number(body.conditionId))
      : undefined;
    if (!resolvedCond && body.conditionName) {
      resolvedCond = conditions.find(
        (c) => c.condition_name.toLowerCase() === body.conditionName!.toLowerCase()
      );
    }
    const finalConditionId = resolvedCond?.id ?? Number(existing.condition_id || 1);
    const finalConditionName =
      resolvedCond?.condition_name ?? body.conditionName ?? String(existing.condition || "Good");

    // Resolve target department, target user, target location per PDF §16
    let targetDeptId = existing.department ? Number(existing.department) : 1;
    let targetUserId: number | null = null;
    let targetLocation: string | null = existing.location ? String(existing.location) : null;
    let transferReason = body.reason?.trim() || "Employee clearance";

    if (action === "RETURNED_TO_STOCK") {
      if (!body.toDepartmentId) {
        return NextResponse.json(
          { error: "Holding department is required for 'Returned to stock'." },
          { status: 400 }
        );
      }
      targetDeptId = Number(body.toDepartmentId);
      targetUserId = null; // Holder -> Unassigned
      targetLocation = body.toLocation?.trim() || null;
      transferReason = body.reason?.trim() || "Employee clearance — Returned to stock";
    } else if (action === "REASSIGNED") {
      if (!body.toUserId) {
        return NextResponse.json(
          { error: "Target active employee is required for 'Reassigned to employee'." },
          { status: 400 }
        );
      }
      targetUserId = Number(body.toUserId);
      if (targetUserId === employeeId) {
        return NextResponse.json(
          { error: "Cannot reassign an asset to the same employee who is clearing." },
          { status: 400 }
        );
      }
      const targetUser = users.find((u) => u.user_id === targetUserId);
      if (!targetUser) {
        return NextResponse.json({ error: "Selected employee was not found." }, { status: 400 });
      }
      // PDF §16: employee in clearance / cleared cannot be selected as holder
      const crCheckRes = await fetch(
        `${API_BASE_URL}/items/clearance_request?filter[employee_id][_eq]=${targetUserId}&limit=1`,
        { headers: AUTH_HEADERS, cache: "no-store" }
      ).catch(() => null);
      if (crCheckRes && crCheckRes.ok) {
        const crCheckJson = (await crCheckRes.json()) as { data?: Array<Record<string, unknown>> };
        if (crCheckJson.data && crCheckJson.data.length > 0) {
          return NextResponse.json(
            {
              error: `Cannot reassign to ${targetUser.user_fname} ${targetUser.user_lname} because they are in clearance or already cleared.`,
            },
            { status: 400 }
          );
        }
      }

      targetDeptId = Number(body.toDepartmentId || targetUser.department_id || targetDeptId);
      targetLocation = body.toLocation?.trim() || targetLocation;
      transferReason =
        body.reason?.trim() ||
        `Employee clearance — Reassigned to ${targetUser.user_fname} ${targetUser.user_lname}`.trim();
    } else if (action === "LOST") {
      targetUserId = null; // Transfer to Unassigned
      targetDeptId = Number(body.toDepartmentId || existing.department || 1);
      targetLocation = null;
      transferReason = body.reason?.trim() || "Employee clearance — Not returned (lost)";
    }

    // 2. Insert into asset_transfers
    const transferPayload = {
      asset_id: assetId,
      effective_date: effectiveDate,
      from_department_id: existing.department ? Number(existing.department) : null,
      to_department_id: targetDeptId,
      from_user_id: existing.employee ? Number(existing.employee) : employeeId,
      to_user_id: targetUserId,
      from_location: existing.location ? String(existing.location) : null,
      to_location: targetLocation,
      condition_id: finalConditionId,
      reason: transferReason,
      is_initial: 0,
      recorded_by: recorderId,
    };

    const transferRes = await fetch(`${API_BASE_URL}/items/asset_transfers`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(transferPayload),
    });
    const transferJson = (await transferRes.json().catch(() => ({}))) as {
      data?: { id?: number };
    };
    if (!transferRes.ok) {
      return NextResponse.json(
        { error: extractError(transferJson, "Failed to record custody transfer in database.") },
        { status: 400 }
      );
    }
    const transferId = transferJson.data?.id ? Number(transferJson.data.id) : null;

    // 3. Sync assets_and_equipment with new custody & condition
    const assetPatchRes = await fetch(`${API_BASE_URL}/items/assets_and_equipment/${assetId}`, {
      method: "PATCH",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        department: targetDeptId,
        employee: targetUserId,
        location: targetLocation,
        condition: finalConditionName,
        condition_id: finalConditionId,
        row_version: Number(existing.row_version || 0) + 1,
      }),
    });
    if (!assetPatchRes.ok) {
      const errJson = await assetPatchRes.json().catch(() => ({}));
      return NextResponse.json(
        { error: extractError(errJson, "Transfer logged, but failed to update asset custody.") },
        { status: 400 }
      );
    }

    // 4. If action === "LOST", post Disposal / Write-off event in asset_events (PDF §16 & §10)
    let eventId: number | null = null;
    const amountCharged = action === "LOST" ? Math.max(0, Number(body.amountCharged || 0)) : null;

    if (action === "LOST") {
      const carryingAmount = Number(
        existing.carrying_amount ?? existing.projected_value ?? existing.acquisition_cost ?? existing.cost_per_item ?? 0
      );
      const approvalThreshold = Number(thresholdStr || 50000);
      const approvalEnabled = approvalOnStr !== "0";
      // Disposal impact = CA; status_id: 1 = PENDING, 2 = APPROVED
      const needsApproval = approvalEnabled && carryingAmount >= approvalThreshold;
      const statusId = needsApproval ? 1 : 2;

      const eventPayload = {
        asset_id: assetId,
        event_type_id: 6, // 6 = DISPOSAL (Disposal / write-off)
        event_source_id: 3, // 3 = CLEARANCE (Employee clearance)
        event_date: effectiveDate,
        status_id: statusId,
        carrying_amount_before: carryingAmount,
        impact: carryingAmount,
        proceeds: amountCharged ?? 0,
        costs_of_disposal: 0,
        remarks: `${transferReason}. Amount charged to employee: ₱${(amountCharged ?? 0).toFixed(2)}`,
        maker_id: recorderId,
      };

      const eventRes = await fetch(`${API_BASE_URL}/items/asset_events`, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify(eventPayload),
      });
      const eventJson = (await eventRes.json().catch(() => ({}))) as {
        data?: { id?: number };
      };
      if (!eventRes.ok) {
        return NextResponse.json(
          { error: extractError(eventJson, "Transfer logged, but failed to post disposal event.") },
          { status: 400 }
        );
      }
      eventId = eventJson.data?.id ? Number(eventJson.data.id) : null;

      // Append audit log for event (5 = APPROVAL_REQUESTED, 4 = EVENT_POSTED)
      await appendAuditLog({
        action_id: needsApproval ? 5 : 4,
        asset_id: assetId,
        user_id: recorderId,
        details: `Employee clearance write-off (disposal) for asset #${assetId} — proceeds ₱${(amountCharged ?? 0).toFixed(2)} (${needsApproval ? "Pending approval" : "Approved"}).`,
      });
    }

    // 5. Find or ensure clearance_request_id and insert into asset_clearance_lines
    let clearanceRequestId = body.clearanceRequestId ? Number(body.clearanceRequestId) : null;
    if (!clearanceRequestId) {
      const crFindRes = await fetch(
        `${API_BASE_URL}/items/clearance_request?filter[employee_id][_eq]=${employeeId}&sort=-id&limit=1`,
        { headers: AUTH_HEADERS, cache: "no-store" }
      ).catch(() => null);
      if (crFindRes && crFindRes.ok) {
        const crFindJson = (await crFindRes.json()) as { data?: Array<{ id?: number }> };
        if (crFindJson.data?.[0]?.id) {
          clearanceRequestId = Number(crFindJson.data[0].id);
        }
      }
    }

    let clearanceLineId: number | null = null;
    if (clearanceRequestId) {
      const processedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
      const linePayload = {
        clearance_request_id: clearanceRequestId,
        asset_id: assetId,
        condition_id: finalConditionId,
        action_id: actionCodeToId(action),
        to_department_id: targetDeptId,
        to_user_id: targetUserId,
        to_location: targetLocation,
        amount_charged: amountCharged,
        transfer_id: transferId,
        event_id: eventId,
        processed_by: recorderId,
        processed_at: processedAt,
        remarks: transferReason,
      };

      const lineRes = await fetch(`${API_BASE_URL}/items/asset_clearance_lines`, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify(linePayload),
      });
      const lineJson = (await lineRes.json().catch(() => ({}))) as {
        data?: { id?: number };
      };
      if (!lineRes.ok) {
        return NextResponse.json(
          { error: extractError(lineJson, "Failed to save clearance line in asset_clearance_lines.") },
          { status: 400 }
        );
      }
      clearanceLineId = lineJson.data?.id ? Number(lineJson.data.id) : null;
    }

    // 6. Append audit log for custody transfer (3 = TRANSFERRED)
    await appendAuditLog({
      action_id: 3,
      asset_id: assetId,
      user_id: recorderId,
      details: `Clearance action (${action}) on asset #${assetId}: ${transferReason}`,
      changes: [
        { field: "department", from: existing.department ?? null, to: targetDeptId },
        { field: "employee", from: existing.employee ?? null, to: targetUserId },
        { field: "location", from: existing.location ?? null, to: targetLocation },
        { field: "condition", from: existing.condition ?? null, to: finalConditionName },
      ],
    });

    return NextResponse.json({
      success: true,
      transfer_id: transferId,
      event_id: eventId,
      clearance_line_id: clearanceLineId,
      message: `Asset #${assetId} processed (${action}) and saved to database.`,
    });
  } catch (error: unknown) {
    console.error("POST /api/fm/asset-management/employee-clearance/process-action error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process clearance action." },
      { status: 500 }
    );
  }
}
