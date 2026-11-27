import { NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

interface DirectusAsset {
  id: number;
  asset_tag?: string | null;
  rfid_code?: string | null;
  item_id?: number | null;
}

interface DirectusItem {
  id: number;
  item_name?: string | null;
}

interface DirectusRead {
  id: number;
  session_id: number;
  asset_id?: number | null;
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
      epc?: string;
      epcs?: string[];
      source?: "RFID" | "Manual";
      asset_id?: number;
      untagged_description?: string;
      clearAll?: boolean;
      removeAssetId?: number;
    };

    // 1. Clear all reads for this session
    if (body.clearAll) {
      const existingRes = await fetch(
        `${API_BASE_URL}/items/asset_count_reads?filter[session_id][_eq]=${sessionId}&fields=id&limit=1000`,
        { headers: AUTH_HEADERS, cache: "no-store" }
      );
      if (existingRes.ok) {
        const exJson = (await existingRes.json()) as { data?: { id: number }[] };
        const ids = (exJson.data || []).map((r) => r.id);
        if (ids.length > 0) {
          await fetch(`${API_BASE_URL}/items/asset_count_reads`, {
            method: "DELETE",
            headers: AUTH_HEADERS,
            body: JSON.stringify(ids),
          });
        }
      }
      return NextResponse.json({ success: true, cleared: true });
    }

    // 2. Uncheck manual asset read
    if (body.removeAssetId) {
      const existingRes = await fetch(
        `${API_BASE_URL}/items/asset_count_reads?filter[session_id][_eq]=${sessionId}&filter[asset_id][_eq]=${body.removeAssetId}&fields=id&limit=100`,
        { headers: AUTH_HEADERS, cache: "no-store" }
      );
      if (existingRes.ok) {
        const exJson = (await existingRes.json()) as { data?: DirectusRead[] };
        const ids = (exJson.data || []).map((r) => r.id);
        if (ids.length > 0) {
          await fetch(`${API_BASE_URL}/items/asset_count_reads`, {
            method: "DELETE",
            headers: AUTH_HEADERS,
            body: JSON.stringify(ids),
          });
        }
      }
      return NextResponse.json({ success: true, removed: true });
    }

    const sourceId = body.source === "Manual" ? 2 : 1;
    const nowIso = new Date().toISOString();

    // Load real assets & items to match EPCs
    const [assetsRes, itemsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/items/assets_and_equipment?limit=500`, {
        headers: AUTH_HEADERS,
        cache: "no-store",
      }),
      fetch(`${API_BASE_URL}/items/items?limit=1000`, {
        headers: AUTH_HEADERS,
        cache: "no-store",
      }),
    ]);

    const assetsJson = assetsRes.ok ? ((await assetsRes.json()) as { data?: DirectusAsset[] }) : { data: [] };
    const itemsJson = itemsRes.ok ? ((await itemsRes.json()) as { data?: DirectusItem[] }) : { data: [] };
    const assets = assetsJson.data || [];
    const itemMap = new Map<number, string>(
      (itemsJson.data || []).map((i) => [i.id, i.item_name || `Asset #${i.id}`])
    );

    const assetByEpc = new Map<string, DirectusAsset>();
    const assetByTag = new Map<string, DirectusAsset>();
    const assetById = new Map<number, DirectusAsset>();
    for (const a of assets) {
      assetById.set(a.id, a);
      if (a.rfid_code && a.rfid_code.trim()) {
        assetByEpc.set(a.rfid_code.trim().toLowerCase(), a);
      }
      const tag = (a.asset_tag || `AST-${String(a.id).padStart(4, "0")}`).trim().toLowerCase();
      assetByTag.set(tag, a);
    }

    const rowsToInsert: Record<string, unknown>[] = [];
    const matchSummary: { epc: string; matched: boolean; tag?: string; itemName?: string }[] = [];

    // Case A: Batch EPCs or single EPC
    const epcList = Array.isArray(body.epcs)
      ? body.epcs.map((e) => e.trim()).filter(Boolean)
      : body.epc && body.epc.trim()
      ? [body.epc.trim()]
      : [];

    if (epcList.length > 0) {
      for (const epcVal of epcList) {
        const key = epcVal.toLowerCase();
        const matched = assetByEpc.get(key) || assetByTag.get(key) || null;
        rowsToInsert.push({
          session_id: sessionId,
          epc: epcVal,
          asset_id: matched ? matched.id : null,
          source_id: sourceId,
          untagged_description: null,
          read_by: 24,
          read_at: nowIso,
        });
        matchSummary.push({
          epc: epcVal,
          matched: Boolean(matched),
          tag: matched
            ? matched.asset_tag || `AST-${String(matched.id).padStart(4, "0")}`
            : undefined,
          itemName: matched?.item_id ? itemMap.get(matched.item_id) : undefined,
        });
      }
    } else if (body.asset_id) {
      // Case B: Manual checklist tick for a specific asset_id
      const matched = assetById.get(Number(body.asset_id)) || null;
      rowsToInsert.push({
        session_id: sessionId,
        epc: matched?.rfid_code || null,
        asset_id: Number(body.asset_id),
        source_id: 2,
        untagged_description: null,
        read_by: 24,
        read_at: nowIso,
      });
    } else if (body.untagged_description && body.untagged_description.trim()) {
      // Case C: Untagged physical item
      rowsToInsert.push({
        session_id: sessionId,
        epc: null,
        asset_id: null,
        source_id: 2,
        untagged_description: body.untagged_description.trim(),
        read_by: 24,
        read_at: nowIso,
      });
    } else {
      return NextResponse.json({ error: "No EPC, asset_id, or untagged description provided" }, { status: 400 });
    }

    const insertRes = await fetch(`${API_BASE_URL}/items/asset_count_reads`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(rowsToInsert.length === 1 ? rowsToInsert[0] : rowsToInsert),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      throw new Error(`Failed to save read to Directus: ${errText}`);
    }

    return NextResponse.json({
      success: true,
      sessionId,
      recordedCount: rowsToInsert.length,
      matches: matchSummary,
    });
  } catch (error: unknown) {
    console.error("POST /physical-count/[id]/read error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to record read" },
      { status: 500 }
    );
  }
}
