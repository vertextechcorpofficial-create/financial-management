import { NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

interface SessionRemarksPayload {
  resolutions?: Record<string, { resolution?: string; note?: string; transferToDeptId?: number }>;
  text?: string;
}

function parseSessionRemarks(raw?: string | null): SessionRemarksPayload {
  if (!raw) return { resolutions: {} };
  try {
    const parsed = JSON.parse(raw) as SessionRemarksPayload;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...parsed, resolutions: parsed.resolutions || {} };
    }
  } catch {
    return { text: raw, resolutions: {} };
  }
  return { resolutions: {} };
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

    const body = (await req.json()) as {
      itemId: string | number;
      assetId?: number | null;
      resolution?: string;
      note?: string;
      transferToDeptId?: number;
      condition?: string;
      epc?: string;
      ignoreUnknown?: boolean;
    };

    // 1. Ignore unknown/untagged read -> delete from asset_count_reads in Directus
    if (body.ignoreUnknown) {
      const readIdMatch = String(body.itemId).match(/^unknown-(\d+)$/);
      const idsToDelete: number[] = [];

      if (readIdMatch) {
        idsToDelete.push(Number(readIdMatch[1]));
      }

      if (body.epc && body.epc.trim()) {
        const findRes = await fetch(
          `${API_BASE_URL}/items/asset_count_reads?filter[session_id][_eq]=${sessionId}&filter[epc][_eq]=${encodeURIComponent(
            body.epc.trim()
          )}&fields=id&limit=100`,
          { headers: AUTH_HEADERS, cache: "no-store" }
        );
        if (findRes.ok) {
          const findJson = (await findRes.json()) as { data?: { id: number }[] };
          for (const r of findJson.data || []) {
            if (!idsToDelete.includes(r.id)) idsToDelete.push(r.id);
          }
        }
      }

      if (idsToDelete.length > 0) {
        const delRes = await fetch(`${API_BASE_URL}/items/asset_count_reads`, {
          method: "DELETE",
          headers: AUTH_HEADERS,
          body: JSON.stringify(idsToDelete),
        });
        if (!delRes.ok) {
          const errText = await delRes.text();
          throw new Error(`Failed to delete ignored read: ${errText}`);
        }
      }

      return NextResponse.json({ success: true, sessionId, deletedReadIds: idsToDelete });
    }

    // 2. Observed condition change -> persist directly on assets_and_equipment
    if (body.condition && body.assetId) {
      const patchAssetRes = await fetch(
        `${API_BASE_URL}/items/assets_and_equipment/${body.assetId}`,
        {
          method: "PATCH",
          headers: AUTH_HEADERS,
          body: JSON.stringify({ condition: body.condition }),
        }
      );
      if (!patchAssetRes.ok) {
        const errText = await patchAssetRes.text();
        throw new Error(`Failed to update asset condition: ${errText}`);
      }
      return NextResponse.json({
        success: true,
        sessionId,
        assetId: body.assetId,
        condition: body.condition,
      });
    }

    // 3. Persist exception resolution / note on asset_count_sessions.remarks
    const sesRes = await fetch(
      `${API_BASE_URL}/items/asset_count_sessions/${sessionId}?fields=id,remarks`,
      { headers: AUTH_HEADERS, cache: "no-store" }
    );
    if (!sesRes.ok) {
      return NextResponse.json({ error: "Count session not found" }, { status: 404 });
    }
    const sesJson = (await sesRes.json()) as { data?: { id: number; remarks?: string | null } };
    const parsed = parseSessionRemarks(sesJson.data?.remarks);

    const key = String(body.itemId);
    const existing = parsed.resolutions?.[key] || {};
    parsed.resolutions = {
      ...(parsed.resolutions || {}),
      [key]: {
        resolution: body.resolution !== undefined ? body.resolution : existing.resolution,
        note: body.note !== undefined ? body.note : existing.note,
        transferToDeptId:
          body.transferToDeptId !== undefined ? body.transferToDeptId : existing.transferToDeptId,
      },
    };

    const saveRes = await fetch(`${API_BASE_URL}/items/asset_count_sessions/${sessionId}`, {
      method: "PATCH",
      headers: AUTH_HEADERS,
      body: JSON.stringify({ remarks: JSON.stringify(parsed) }),
    });

    if (!saveRes.ok) {
      const errText = await saveRes.text();
      throw new Error(`Failed to save resolution: ${errText}`);
    }

    return NextResponse.json({
      success: true,
      sessionId,
      itemId: key,
      saved: parsed.resolutions[key],
    });
  } catch (error: unknown) {
    console.error("POST /physical-count/[id]/resolve error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resolve item" },
      { status: 500 }
    );
  }
}
