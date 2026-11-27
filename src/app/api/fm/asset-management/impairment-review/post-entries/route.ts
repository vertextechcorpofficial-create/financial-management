import { NextResponse } from "next/server";
import {
  appendAuditLog,
  fetchGeneralSetting,
  getDefaultUserId,
} from "@/modules/financial-management/asset-management/registration/services/asset";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

interface DirectusLineItem {
  id: number;
  review_id: number;
  asset_id: number;
  carrying_amount?: number | string | null;
  conclusion_id?: number | null;
  fvlcd?: number | string | null;
  viu?: number | string | null;
  fvlcts?: number | string | null;
  new_remaining_months?: number | null;
  new_residual_value?: number | string | null;
  event_id?: number | null;
  note?: string | null;
}

interface DirectusConclusionItem {
  id: number;
  name: string;
  event_type_id?: number | null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { review_id?: number };
    const reviewId = body.review_id;
    if (!reviewId) {
      return NextResponse.json({ error: "review_id is required" }, { status: 400 });
    }

    const [validUserId, approvalEnabledStr, approvalThresholdStr] = await Promise.all([
      getDefaultUserId(),
      fetchGeneralSetting("approval_enabled"),
      fetchGeneralSetting("approval_threshold"),
    ]);

    const approvalEnabled = Number(approvalEnabledStr ?? 1) === 1;
    const approvalThreshold = Number(approvalThresholdStr ?? 50000);

    let postedCount = 0;

    if (API_BASE_URL) {
      // 1. Fetch review date
      const revRes = await fetch(`${API_BASE_URL}/items/asset_impairment_reviews/${reviewId}`, {
        headers: AUTH_HEADERS,
        cache: "no-store",
      });
      if (!revRes.ok) {
        return NextResponse.json({ error: "Impairment review not found in database." }, { status: 404 });
      }
      const revJson = (await revRes.json()) as { data?: { review_date?: string } };
      const reviewDate = revJson.data?.review_date
        ? revJson.data.review_date.split("T")[0]
        : new Date().toISOString().split("T")[0];

      // 2. Fetch conclusions to map event_type_id
      const conRes = await fetch(`${API_BASE_URL}/items/asset_impairment_conclusions`, {
        headers: AUTH_HEADERS,
        cache: "no-store",
      });
      const conJson = (await conRes.json()) as { data?: DirectusConclusionItem[] };
      const conMap = new Map<number, DirectusConclusionItem>();
      if (Array.isArray(conJson.data)) {
        conJson.data.forEach((c) => conMap.set(c.id, c));
      }

      // 3. Fetch concluded lines that have NOT been posted yet (event_id IS NULL prevents duplicates!)
      const lineRes = await fetch(
        `${API_BASE_URL}/items/asset_impairment_review_lines?filter[review_id][_eq]=${reviewId}&filter[conclusion_id][_nnull]=true&filter[event_id][_null]=true&limit=500`,
        { headers: AUTH_HEADERS, cache: "no-store" }
      );
      const lineJson = (await lineRes.json()) as { data?: DirectusLineItem[] };

      if (Array.isArray(lineJson.data)) {
        for (const line of lineJson.data) {
          if (!line.conclusion_id || line.event_id) continue;
          const con = conMap.get(line.conclusion_id);
          const eventTypeId = con?.event_type_id;
          if (!eventTypeId) continue;

          const carryingAmount = Number(line.carrying_amount || 0);
          const fvlcd = line.fvlcd !== null && line.fvlcd !== undefined ? Number(line.fvlcd) : null;
          const viu = line.viu !== null && line.viu !== undefined ? Number(line.viu) : null;
          const fvlcts = line.fvlcts !== null && line.fvlcts !== undefined ? Number(line.fvlcts) : null;

          // Compute actual IAS 36 / IAS 16 financial impact
          let impact = 0;
          if (eventTypeId === 1) {
            const recoverable = Math.max(fvlcd ?? 0, viu ?? 0);
            impact = Number((recoverable - carryingAmount).toFixed(2));
          } else if (eventTypeId === 5) {
            impact = Number(Math.min(0, (fvlcts ?? carryingAmount) - carryingAmount).toFixed(2));
          } else if (eventTypeId === 6) {
            impact = Number((-carryingAmount).toFixed(2));
          }

          const needsApproval =
            approvalEnabled && eventTypeId !== 3 && Math.abs(impact) >= approvalThreshold;
          const statusId = needsApproval ? 1 : 2; // 1 = PENDING, 2 = APPROVED

          const evBody: Record<string, unknown> = {
            asset_id: line.asset_id,
            event_type_id: eventTypeId,
            event_source_id: 5, // IMPAIRMENT_REVIEW
            event_date: reviewDate,
            status_id: statusId,
            carrying_amount_before: carryingAmount,
            impact,
            remarks: line.note || `Impairment review: ${con?.name || "Concluded"}`,
            maker_id: validUserId,
            row_version: 0,
          };

          if (fvlcd !== null) evBody.fvlcd = fvlcd;
          if (viu !== null) evBody.viu = viu;
          if (fvlcts !== null) evBody.fvlcts = fvlcts;
          if (line.new_remaining_months) evBody.new_remaining_months = line.new_remaining_months;
          if (line.new_residual_value !== null && line.new_residual_value !== undefined) {
            evBody.new_residual_value = Number(line.new_residual_value);
          }

          const evRes = await fetch(`${API_BASE_URL}/items/asset_events`, {
            method: "POST",
            headers: AUTH_HEADERS,
            body: JSON.stringify(evBody),
          });

          if (!evRes.ok) {
            const errJson = (await evRes.json().catch(() => ({}))) as {
              errors?: Array<{ message?: string }>;
            };
            return NextResponse.json(
              {
                error:
                  errJson.errors?.[0]?.message ||
                  `Failed to create accounting event for asset #${line.asset_id}.`,
              },
              { status: 400 }
            );
          }

          const evData = (await evRes.json()) as { data?: { id: number } };
          const evId = evData.data?.id;
          if (evId) {
            await fetch(`${API_BASE_URL}/items/asset_impairment_review_lines/${line.id}`, {
              method: "PATCH",
              headers: AUTH_HEADERS,
              body: JSON.stringify({ event_id: evId }),
            });
          }
          postedCount++;
        }
      }

      if (postedCount > 0) {
        await appendAuditLog({
          action_id: 14, // IMPAIRMENT_REVIEW
          user_id: validUserId,
          details: `Posted ${postedCount} accounting event(s) from impairment review #${reviewId}`,
        });
      }
    }

    return NextResponse.json({ success: true, count: postedCount });
  } catch (error: unknown) {
    console.error("POST /api/fm/asset-management/impairment-review/post-entries error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
