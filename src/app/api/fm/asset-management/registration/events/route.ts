import { NextResponse } from "next/server";
import {
  appendAuditLog,
  fetchGeneralSetting,
  getDefaultUserId,
} from "@/modules/financial-management/asset-management/registration/services/asset";
import { fetchAssetById } from "@/modules/financial-management/asset-management/registration/services/assetDetailService";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

function resolveEventTypeId(eventType: string): number {
  const t = eventType.toLowerCase();
  if (t.includes("impairment")) return 1; // IMPAIRMENT
  if (t.includes("revaluation")) return 2; // REVALUATION
  if (t.includes("estimate") || t.includes("life")) return 3; // ESTIMATE
  if (t.includes("subsequent")) return 4; // SUBSEQUENT
  if (t.includes("held for sale")) return 5; // HELD_FOR_SALE
  if (t.includes("disposal") || t.includes("derecognition") || t.includes("write-off")) return 6; // DISPOSAL
  return 1;
}

export async function POST(req: Request) {
  try {
    if (!API_BASE_URL) {
      return NextResponse.json({ error: "API_BASE_URL is not configured." }, { status: 500 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    const assetId = Number(body.asset_id);
    const eventTypeStr = String(body.event_type || "").trim();
    const eventDate = String(body.event_date || "").split("T")[0];

    if (!assetId || !eventTypeStr || !eventDate) {
      return NextResponse.json(
        { error: "asset_id, event_type, and event_date are required." },
        { status: 400 }
      );
    }

    const asset = await fetchAssetById(assetId);
    if (!asset) {
      return NextResponse.json({ error: "Asset not found in database." }, { status: 404 });
    }

    // Check closed periods in asset_period_closes (cannot post event in a closed period)
    const eventPeriod = eventDate.slice(0, 7); // YYYY-MM
    const closesRes = await fetch(
      `${API_BASE_URL}/items/asset_period_closes?filter[reopened_at][_null]=true&sort=-closed_through&limit=1`,
      { headers: AUTH_HEADERS, cache: "no-store" }
    ).catch(() => null);
    if (closesRes?.ok) {
      const closesJson = (await closesRes.json()) as { data?: Array<{ closed_through?: string }> };
      const closedThrough = closesJson.data?.[0]?.closed_through;
      if (closedThrough && eventPeriod <= closedThrough) {
        return NextResponse.json(
          { error: `Cannot post event dated ${eventDate}: period ${closedThrough} is already closed.` },
          { status: 400 }
        );
      }
    }

    const eventTypeId = resolveEventTypeId(eventTypeStr);
    const carryingBefore = Number(asset.projected_value ?? asset.cost_per_item ?? 0);

    const fvlcd = body.fvlcd !== undefined && body.fvlcd !== "" ? Number(body.fvlcd) : null;
    const viu = body.viu !== undefined && body.viu !== "" ? Number(body.viu) : null;
    const fairValue = body.fair_value !== undefined && body.fair_value !== "" ? Number(body.fair_value) : null;
    const fvlcts = body.fvlcts !== undefined && body.fvlcts !== "" ? Number(body.fvlcts) : null;
    const proceeds = body.proceeds !== undefined && body.proceeds !== "" ? Number(body.proceeds) : null;
    const costsOfDisposal =
      body.costs_of_disposal !== undefined && body.costs_of_disposal !== ""
        ? Number(body.costs_of_disposal)
        : null;
    const amount = body.amount !== undefined && body.amount !== "" ? Number(body.amount) : null;
    const newRemainingMonths =
      body.new_remaining_months !== undefined && body.new_remaining_months !== ""
        ? Number(body.new_remaining_months)
        : null;
    const newResidualValue =
      body.new_residual_value !== undefined && body.new_residual_value !== ""
        ? Number(body.new_residual_value)
        : null;

    // Compute IAS 16 / IAS 36 financial impact
    let impact = 0;
    if (eventTypeId === 1) {
      // Impairment: recoverable = max(FVLCD, VIU)
      const recoverable = Math.max(fvlcd ?? 0, viu ?? 0);
      impact = Number((recoverable - carryingBefore).toFixed(2));
    } else if (eventTypeId === 2) {
      // Revaluation
      impact = Number(((fairValue ?? carryingBefore) - carryingBefore).toFixed(2));
    } else if (eventTypeId === 4) {
      // Subsequent expenditure
      impact = Number((amount ?? 0).toFixed(2));
    } else if (eventTypeId === 5) {
      // Held for sale
      impact = Number(Math.min(0, (fvlcts ?? carryingBefore) - carryingBefore).toFixed(2));
    } else if (eventTypeId === 6) {
      // Disposal: net proceeds - carrying amount
      const netProceeds = (proceeds ?? 0) - (costsOfDisposal ?? 0);
      impact = Number((netProceeds - carryingBefore).toFixed(2));
    }

    // Maker-checker threshold check from asset_settings
    const [approvalEnabledStr, approvalThresholdStr, makerId] = await Promise.all([
      fetchGeneralSetting("approval_enabled"),
      fetchGeneralSetting("approval_threshold"),
      getDefaultUserId(),
    ]);
    const approvalEnabled = Number(approvalEnabledStr ?? 1) === 1;
    const approvalThreshold = Number(approvalThresholdStr ?? 50000);

    const needsApproval =
      approvalEnabled &&
      eventTypeId !== 3 && // Change in estimate doesn't require threshold approval
      Math.abs(impact) >= approvalThreshold;

    const statusId = needsApproval ? 1 : 2; // 1 = PENDING, 2 = APPROVED

    const dbPayload: Record<string, unknown> = {
      asset_id: assetId,
      event_type_id: eventTypeId,
      event_source_id: 1, // MANUAL (Entered on the asset page)
      event_date: eventDate,
      status_id: statusId,
      carrying_amount_before: carryingBefore,
      impact,
      fvlcd,
      viu,
      fair_value: fairValue,
      fvlcts,
      proceeds,
      costs_of_disposal: costsOfDisposal,
      amount,
      capitalize: eventTypeId === 4 ? (body.capitalize === false ? 0 : 1) : null,
      new_remaining_months: newRemainingMonths,
      new_residual_value: newResidualValue,
      remarks: String(body.remarks || "").trim() || null,
      maker_id: makerId,
      row_version: 0,
    };

    const createRes = await fetch(`${API_BASE_URL}/items/asset_events`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(dbPayload),
    });

    const createJson = (await createRes.json().catch(() => ({}))) as {
      data?: Record<string, unknown>;
      errors?: Array<{ message?: string }>;
    };
    if (!createRes.ok) {
      const msg = createJson.errors?.[0]?.message || "Failed to save accounting event in database.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // If auto-approved and Change in Estimate, sync asset useful life / residual value
    if (statusId === 2 && eventTypeId === 3 && (newRemainingMonths || newResidualValue !== null)) {
      const patchObj: Record<string, unknown> = {};
      if (newRemainingMonths) {
        patchObj.life_months = newRemainingMonths;
        patchObj.life_span = Math.max(1, Math.round(newRemainingMonths / 12));
      }
      if (newResidualValue !== null) {
        patchObj.residual_value = newResidualValue;
      }
      await fetch(`${API_BASE_URL}/items/assets_and_equipment/${assetId}`, {
        method: "PATCH",
        headers: AUTH_HEADERS,
        body: JSON.stringify(patchObj),
      }).catch(() => {});
    }

    // Append audit log: 5 = APPROVAL_REQUESTED or 4 = EVENT_POSTED
    await appendAuditLog({
      action_id: needsApproval ? 5 : 4,
      asset_id: assetId,
      user_id: makerId,
      details: `${eventTypeStr} (${eventDate}) ${needsApproval ? "submitted for approval" : "posted"} — impact ₱${impact.toLocaleString()}`,
    });

    return NextResponse.json({
      success: true,
      pendingApproval: needsApproval,
      data: createJson.data,
    });
  } catch (error: unknown) {
    console.error("POST Event Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
