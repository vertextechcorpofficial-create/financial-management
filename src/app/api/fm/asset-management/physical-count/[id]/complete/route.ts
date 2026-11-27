import { NextResponse } from "next/server";
import type { CountItemResult } from "@/modules/financial-management/asset-management/physical-count/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

function mapResultTypeId(item: CountItemResult): number {
  switch (item.result_type) {
    case "found":
      return 1; // FOUND
    case "missing":
      return 2; // MISSING
    case "misplaced":
      return 3; // MISPLACED
    case "derecognised":
      return 4; // DERECOGNISED_FOUND
    case "unknown":
      return item.rfid_code ? 5 : 6; // 5=UNKNOWN, 6=UNTAGGED
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!API_BASE_URL) {
      return NextResponse.json({ error: "Directus API URL not configured" }, { status: 500 });
    }

    const { id } = await params;
    const sessionId = Number(id);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
    }

    let items: CountItemResult[] = [];
    try {
      const body = (await req.json()) as { items?: CountItemResult[] };
      if (Array.isArray(body?.items)) items = body.items;
    } catch {
      // Optional body
    }

    // 1. Snapshot final count results into asset_count_results
    if (items.length > 0) {
      // Clear previous results for this session if re-completing
      const prevRes = await fetch(
        `${API_BASE_URL}/items/asset_count_results?filter[session_id][_eq]=${sessionId}&fields=id&limit=1000`,
        { headers: AUTH_HEADERS, cache: "no-store" }
      );
      if (prevRes.ok) {
        const prevJson = (await prevRes.json()) as { data?: { id: number }[] };
        const prevIds = (prevJson.data || []).map((r) => r.id);
        if (prevIds.length > 0) {
          await fetch(`${API_BASE_URL}/items/asset_count_results`, {
            method: "DELETE",
            headers: AUTH_HEADERS,
            body: JSON.stringify(prevIds),
          });
        }
      }

      const resultPayloads = items.map((item) => ({
        session_id: sessionId,
        asset_id: item.asset_id || null,
        epc: item.rfid_code || null,
        result_type_id: mapResultTypeId(item),
        read_source_id:
          item.result_type === "missing"
            ? null
            : item.verified_by === "Manual tick"
            ? 2
            : 1,
        read_by: item.result_type === "missing" ? null : 24,
        untagged_description:
          item.result_type === "unknown" && !item.rfid_code
            ? item.description || item.item_name || null
            : null,
      }));

      const insRes = await fetch(`${API_BASE_URL}/items/asset_count_results`, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify(resultPayloads),
      });

      if (!insRes.ok) {
        const errText = await insRes.text();
        throw new Error(`Failed to write asset_count_results: ${errText}`);
      }
    }

    // 2. Mark session Completed in asset_count_sessions
    const nowIso = new Date().toISOString();
    const patchRes = await fetch(`${API_BASE_URL}/items/asset_count_sessions/${sessionId}`, {
      method: "PATCH",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        status_id: 2, // Completed
        completed_by: 24,
        completed_at: nowIso,
      }),
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      throw new Error(`Failed to complete count session: ${errText}`);
    }

    return NextResponse.json({
      success: true,
      sessionId,
      status: "Completed",
      resultsSaved: items.length,
      completedAt: nowIso,
    });
  } catch (error: unknown) {
    console.error("POST /physical-count/[id]/complete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to complete count" },
      { status: 500 }
    );
  }
}
