import { NextResponse } from "next/server";
import { getDefaultUserId } from "@/modules/financial-management/asset-management/registration/services/asset";
import type { UpdateLinePayload } from "@/modules/financial-management/asset-management/impairment-review/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as UpdateLinePayload;

    if (API_BASE_URL) {
      const updateData: Record<string, unknown> = {};

      if (body.conclusion_id !== undefined) {
        updateData.conclusion_id = body.conclusion_id;
        updateData.concluded_at = body.conclusion_id
          ? new Date().toISOString().slice(0, 19).replace("T", " ")
          : null;
        updateData.concluded_by = body.conclusion_id ? await getDefaultUserId() : null;
      }
      if (body.notes !== undefined) updateData.note = body.notes;
      if (body.fvlcd !== undefined) updateData.fvlcd = body.fvlcd;
      if (body.viu !== undefined) updateData.viu = body.viu;
      if (body.fvlcts !== undefined) updateData.fvlcts = body.fvlcts;
      if (body.cgu_name !== undefined) updateData.cgu_name = body.cgu_name;
      if (body.new_remaining_months !== undefined) {
        updateData.new_remaining_months = body.new_remaining_months;
      }
      if (body.new_residual_value !== undefined) {
        updateData.new_residual_value = body.new_residual_value;
      }
      if (body.loss_amount !== undefined) updateData.loss_amount = body.loss_amount;
      if (body.is_obsolete !== undefined) updateData.is_obsolete = body.is_obsolete ? 1 : 0;

      if (Object.keys(updateData).length > 0) {
        const patchRes = await fetch(`${API_BASE_URL}/items/asset_impairment_review_lines/${id}`, {
          method: "PATCH",
          headers: AUTH_HEADERS,
          body: JSON.stringify(updateData),
        });

        if (!patchRes.ok) {
          const errData = (await patchRes.json().catch(() => ({}))) as {
            errors?: Array<{ message?: string }>;
          };
          return NextResponse.json(
            { error: errData.errors?.[0]?.message || "Failed to update review line in database." },
            { status: 400 }
          );
        }
      }

      if (body.is_obsolete !== undefined) {
        const obsoleteId = 8; // OBSOLETE indicator id

        if (body.is_obsolete) {
          // Avoid duplicate obsolete indicator row
          const existsRes = await fetch(
            `${API_BASE_URL}/items/asset_impairment_review_line_indicators?filter[line_id][_eq]=${id}&filter[indicator_id][_eq]=${obsoleteId}`,
            { headers: AUTH_HEADERS, cache: "no-store" }
          );
          const existsJson = existsRes.ok
            ? ((await existsRes.json()) as { data?: Array<{ id: number }> })
            : { data: [] };

          if (!existsJson.data || existsJson.data.length === 0) {
            const insRes = await fetch(`${API_BASE_URL}/items/asset_impairment_review_line_indicators`, {
              method: "POST",
              headers: AUTH_HEADERS,
              body: JSON.stringify({
                line_id: Number(id),
                indicator_id: obsoleteId,
              }),
            });
            if (!insRes.ok) {
              const errData = (await insRes.json().catch(() => ({}))) as {
                errors?: Array<{ message?: string }>;
              };
              return NextResponse.json(
                { error: errData.errors?.[0]?.message || "Failed to add obsolete indicator." },
                { status: 400 }
              );
            }
          }
        } else {
          const findRes = await fetch(
            `${API_BASE_URL}/items/asset_impairment_review_line_indicators?filter[line_id][_eq]=${id}&filter[indicator_id][_eq]=${obsoleteId}`,
            { headers: AUTH_HEADERS, cache: "no-store" }
          );
          const findJson = (await findRes.json()) as { data?: Array<{ id: number }> };
          if (findJson.data && findJson.data.length > 0) {
            for (const item of findJson.data) {
              await fetch(
                `${API_BASE_URL}/items/asset_impairment_review_line_indicators/${item.id}`,
                { method: "DELETE", headers: AUTH_HEADERS }
              );
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("PATCH /api/fm/asset-management/impairment-review/line/[id] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
