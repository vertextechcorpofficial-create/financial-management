import { NextResponse } from "next/server";
import { fetchUsers } from "@/modules/financial-management/asset-management/registration/services/asset";

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

    const users = await fetchUsers().catch(() => []);
    const validUserId = users[0]?.user_id || 24;

    let postedCount = 0;

    if (API_BASE_URL) {
      // 1. Fetch review date
      const revRes = await fetch(`${API_BASE_URL}/items/asset_impairment_reviews/${reviewId}`, {
        headers: AUTH_HEADERS,
      });
      const revJson = (await revRes.json()) as { data?: { review_date?: string } };
      const reviewDate = revJson.data?.review_date ? revJson.data.review_date.split("T")[0] : new Date().toISOString().split("T")[0];

      // 2. Fetch conclusions to map event_type_id
      const conRes = await fetch(`${API_BASE_URL}/items/asset_impairment_conclusions`, {
        headers: AUTH_HEADERS,
      });
      const conJson = (await conRes.json()) as { data?: DirectusConclusionItem[] };
      const conMap = new Map<number, DirectusConclusionItem>();
      if (Array.isArray(conJson.data)) {
        conJson.data.forEach((c) => conMap.set(c.id, c));
      }

      // 3. Fetch concluded lines for this review
      const lineRes = await fetch(
        `${API_BASE_URL}/items/asset_impairment_review_lines?filter[review_id][_eq]=${reviewId}&filter[conclusion_id][_nnull]=true`,
        { headers: AUTH_HEADERS }
      );
      const lineJson = (await lineRes.json()) as { data?: DirectusLineItem[] };

      if (Array.isArray(lineJson.data)) {
        for (const line of lineJson.data) {
          if (!line.conclusion_id) continue;
          const con = conMap.get(line.conclusion_id);
          const eventTypeId = con?.event_type_id;
          if (!eventTypeId) continue; // Concluded with no accounting event needed (e.g. ample headroom)

          const carryingAmount = Number(line.carrying_amount || 0);
          const statusId = carryingAmount >= 50000 ? 1 : 2; // 1 = PENDING APPROVAL, 2 = APPROVED

          const evBody: Record<string, unknown> = {
            asset_id: line.asset_id,
            event_type_id: eventTypeId,
            event_source_id: 5, // IMPAIRMENT_REVIEW
            event_date: reviewDate,
            status_id: statusId,
            impact: carryingAmount,
            remarks: line.note || `Impairment review: ${con?.name || "Concluded"}`,
            maker_id: validUserId,
            made_at: new Date().toISOString(),
          };

          if (line.fvlcd) evBody.fvlcd = line.fvlcd;
          if (line.viu) evBody.viu = line.viu;
          if (line.fvlcts) evBody.fvlcts = line.fvlcts;
          if (line.new_remaining_months) evBody.new_remaining_months = line.new_remaining_months;
          if (line.new_residual_value) evBody.new_residual_value = line.new_residual_value;

          const evRes = await fetch(`${API_BASE_URL}/items/asset_events`, {
            method: "POST",
            headers: AUTH_HEADERS,
            body: JSON.stringify(evBody),
          });

          if (evRes.ok) {
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
