import { NextResponse } from "next/server";
import type {
  CountItemResult,
  CountSession,
} from "@/modules/financial-management/asset-management/physical-count/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

interface DirectusSession {
  id: number;
  name: string;
  count_date: string;
  method_id: number;
  location_filter?: string | null;
  status_id: number;
  started_by: number;
  started_at: string;
  completed_by?: number | null;
  completed_at?: string | null;
  remarks?: string | null;
}

interface DirectusSessionDept {
  id: number;
  session_id: number;
  department_id: number;
}

interface DirectusRead {
  id: number;
  session_id: number;
  epc?: string | null;
  asset_id?: number | null;
  source_id: number;
  untagged_description?: string | null;
  read_by: number;
  read_at: string;
}

interface DirectusAsset {
  id: number;
  asset_tag?: string | null;
  rfid_code?: string | null;
  barcode?: string | null;
  serial?: string | null;
  brand?: string | null;
  model?: string | null;
  location?: string | null;
  item_id?: number | null;
  department?: number | null;
  employee?: number | null;
  condition?: string | null;
  cost_per_item?: number | string | null;
  acquisition_cost?: number | string | null;
  record_status_id?: number | null;
  is_active?: number | boolean | null;
}

interface DirectusItem {
  id: number;
  item_name?: string | null;
}

interface DirectusDept {
  department_id: number;
  department_name?: string | null;
}

interface DirectusUser {
  user_id: number;
  user_fname?: string | null;
  user_lname?: string | null;
}

interface DirectusEvent {
  id: number;
  asset_id: number;
  event_type_id: number;
  status_id: number;
}

async function safeList<T>(path: string): Promise<T[]> {
  if (!API_BASE_URL) return [];
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: AUTH_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: T[] };
    return Array.isArray(json.data) ? json.data : [];
  } catch {
    return [];
  }
}

export async function GET(
  _req: Request,
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

    const sessionRes = await fetch(`${API_BASE_URL}/items/asset_count_sessions/${sessionId}`, {
      headers: AUTH_HEADERS,
      cache: "no-store",
    });

    if (!sessionRes.ok) {
      return NextResponse.json({ error: "Count session not found" }, { status: 404 });
    }

    const sessionJson = (await sessionRes.json()) as { data?: DirectusSession };
    const rawSession = sessionJson.data;
    if (!rawSession) {
      return NextResponse.json({ error: "Count session not found" }, { status: 404 });
    }

    const [sessionDepts, reads, assets, itemsList, depts, users, events] = await Promise.all([
      safeList<DirectusSessionDept>(
        `/items/asset_count_session_departments?filter[session_id][_eq]=${sessionId}&limit=100`
      ),
      safeList<DirectusRead>(
        `/items/asset_count_reads?filter[session_id][_eq]=${sessionId}&sort=-id&limit=1000`
      ),
      safeList<DirectusAsset>("/items/assets_and_equipment?limit=500"),
      safeList<DirectusItem>("/items/items?limit=1000"),
      safeList<DirectusDept>("/items/department?limit=200"),
      safeList<DirectusUser>("/items/user?limit=500"),
      safeList<DirectusEvent>("/items/asset_events?filter[status_id][_eq]=2&limit=1000"),
    ]);

    const itemMap = new Map<number, string>(
      itemsList.map((i) => [i.id, i.item_name || `Asset Item #${i.id}`])
    );
    const deptMap = new Map<number, string>(
      depts.map((d) => [d.department_id, d.department_name || `Dept #${d.department_id}`])
    );
    const userMap = new Map<number, string>(
      users.map((u) => [
        u.user_id,
        `${u.user_fname || ""} ${u.user_lname || ""}`.trim() || `User #${u.user_id}`,
      ])
    );

    // Assets that are disposed (event_type_id === 6) or held for sale (event_type_id === 5)
    const derecognisedAssetIds = new Set<number>();
    for (const ev of events) {
      if (ev.event_type_id === 6 || ev.event_type_id === 5) {
        derecognisedAssetIds.add(ev.asset_id);
      }
    }

    const scopedDeptIds = new Set(sessionDepts.map((sd) => Number(sd.department_id)));
    const scopedDeptNames =
      scopedDeptIds.size > 0
        ? Array.from(scopedDeptIds).map((dId) => deptMap.get(dId) || `Dept #${dId}`)
        : ["All Departments"];

    // Build lookup maps for matching RFID / asset_tag / asset_id
    const assetById = new Map<number, DirectusAsset>();
    const assetByEpc = new Map<string, DirectusAsset>();
    const assetByTag = new Map<string, DirectusAsset>();

    for (const a of assets) {
      assetById.set(a.id, a);
      if (a.rfid_code && a.rfid_code.trim()) {
        assetByEpc.set(a.rfid_code.trim().toLowerCase(), a);
      }
      const tag = (a.asset_tag || `AST-${String(a.id).padStart(4, "0")}`).trim().toLowerCase();
      assetByTag.set(tag, a);
    }

    const isAssetDerecognised = (a: DirectusAsset) =>
      derecognisedAssetIds.has(a.id) || a.record_status_id === 2 || a.is_active === 0;

    const isAssetExpected = (a: DirectusAsset) => {
      if (isAssetDerecognised(a)) return false;
      if (scopedDeptIds.size === 0) return true;
      return Boolean(a.department && scopedDeptIds.has(Number(a.department)));
    };

    const formatAssetInfo = (a: DirectusAsset) => ({
      asset_id: a.id,
      asset_tag: a.asset_tag || `AST-${String(a.id).padStart(4, "0")}`,
      item_name: a.item_id ? itemMap.get(a.item_id) || `Asset #${a.id}` : `Asset #${a.id}`,
      rfid_code: a.rfid_code || "",
      barcode: a.barcode || "",
      serial: a.serial || "",
      brand: a.brand || "",
      model: a.model || "",
      department_name: a.department ? deptMap.get(a.department) || "Unassigned" : "Unassigned",
      holder_name: a.employee ? userMap.get(a.employee) || "Unassigned" : "Unassigned",
      location: a.location || "",
      carrying_amount: Number(a.acquisition_cost ?? a.cost_per_item ?? 0),
      condition_observed: a.condition || "Good",
    });

    // Classify all reads (deduplicated by matched asset_id or epc)
    const foundAssetIds = new Set<number>();
    const foundMap = new Map<number, { asset: DirectusAsset; sourceId: number }>();
    const misplacedMap = new Map<number, { asset: DirectusAsset; sourceId: number }>();
    const derecognisedMap = new Map<number, { asset: DirectusAsset; sourceId: number }>();
    const unknownReads: DirectusRead[] = [];
    const seenUnknownEpcs = new Set<string>();

    const recentReads: {
      epc: string;
      matched_tag?: string;
      item_name?: string;
      is_unknown?: boolean;
    }[] = [];

    for (const r of reads) {
      let matchedAsset: DirectusAsset | undefined;
      if (r.asset_id) {
        matchedAsset = assetById.get(r.asset_id);
      }
      if (!matchedAsset && r.epc && r.epc.trim()) {
        const key = r.epc.trim().toLowerCase();
        matchedAsset = assetByEpc.get(key) || assetByTag.get(key);
      }

      if (matchedAsset) {
        const info = formatAssetInfo(matchedAsset);
        recentReads.push({
          epc: r.epc || info.rfid_code || info.asset_tag,
          matched_tag: info.asset_tag,
          item_name: info.item_name,
          is_unknown: false,
        });

        if (isAssetDerecognised(matchedAsset)) {
          if (!derecognisedMap.has(matchedAsset.id)) {
            derecognisedMap.set(matchedAsset.id, { asset: matchedAsset, sourceId: r.source_id });
          }
        } else if (isAssetExpected(matchedAsset)) {
          foundAssetIds.add(matchedAsset.id);
          if (!foundMap.has(matchedAsset.id)) {
            foundMap.set(matchedAsset.id, { asset: matchedAsset, sourceId: r.source_id });
          }
        } else {
          if (!misplacedMap.has(matchedAsset.id)) {
            misplacedMap.set(matchedAsset.id, { asset: matchedAsset, sourceId: r.source_id });
          }
        }
      } else {
        const label = r.epc || r.untagged_description || "Untagged item";
        recentReads.push({
          epc: label,
          is_unknown: true,
        });
        const ukKey = r.epc ? r.epc.trim().toLowerCase() : `untagged-${r.id}`;
        if (!seenUnknownEpcs.has(ukKey)) {
          seenUnknownEpcs.add(ukKey);
          unknownReads.push(r);
        }
      }
    }

    // Parse saved resolutions from rawSession.remarks (if JSON)
    let savedResolutions: Record<string, { resolution?: string; note?: string; transferToDeptId?: number }> = {};
    if (rawSession.remarks) {
      try {
        const parsed = JSON.parse(rawSession.remarks) as {
          resolutions?: Record<string, { resolution?: string; note?: string; transferToDeptId?: number }>;
        };
        if (parsed && typeof parsed === "object" && parsed.resolutions) {
          savedResolutions = parsed.resolutions;
        }
      } catch {
        // plain text remarks
      }
    }

    const items: CountItemResult[] = [];
    const expectedAssets: CountItemResult[] = [];

    // Expected assets -> either Found or Missing
    for (const a of assets) {
      if (!isAssetExpected(a)) continue;
      const info = formatAssetInfo(a);
      const isFound = foundAssetIds.has(a.id);
      const foundEntry = foundMap.get(a.id);
      const itemKey = `asset-${a.id}`;
      const savedRes = savedResolutions[itemKey];

      const entry: CountItemResult = {
        id: itemKey,
        ...info,
        verified_by: isFound
          ? foundEntry?.sourceId === 2
            ? "Manual tick"
            : "RFID read"
          : undefined,
        result_type: isFound ? "found" : "missing",
        resolution: savedRes?.resolution || "",
        note: savedRes?.note || "",
      };

      expectedAssets.push(entry);
      items.push(entry);
    }

    // Misplaced items
    for (const { asset, sourceId } of misplacedMap.values()) {
      const info = formatAssetInfo(asset);
      const itemKey = `misplaced-${asset.id}`;
      const savedRes = savedResolutions[itemKey];
      items.push({
        id: itemKey,
        ...info,
        verified_by: sourceId === 2 ? "Manual tick" : "RFID read",
        result_type: "misplaced",
        resolution: savedRes?.resolution || "",
        note: savedRes?.note || "",
      });
    }

    // Derecognised but found items
    for (const { asset, sourceId } of derecognisedMap.values()) {
      const info = formatAssetInfo(asset);
      items.push({
        id: `derec-${asset.id}`,
        ...info,
        verified_by: sourceId === 2 ? "Manual tick" : "RFID read",
        result_type: "derecognised",
        resolution: "",
        note: "",
      });
    }

    // Unknown / untagged items
    for (const ur of unknownReads) {
      items.push({
        id: `unknown-${ur.id}`,
        asset_id: null,
        rfid_code: ur.epc || "",
        description: ur.untagged_description || "Unknown RFID tag",
        carrying_amount: 0,
        condition_observed: "Good",
        result_type: "unknown",
        note: "",
      });
    }

    const expectedCount = expectedAssets.length;
    const foundCount = foundMap.size;
    const missingCount = Math.max(0, expectedCount - foundCount);
    const misplacedCount = misplacedMap.size;
    const derecognisedCount = derecognisedMap.size;
    const unknownCount = unknownReads.length;
    const untaggedCount = unknownReads.filter((u) => !u.epc && u.untagged_description).length;
    const accuracyPercent =
      expectedCount > 0 ? Math.round((foundCount / expectedCount) * 1000) / 10 : 100;

    // Keep session summary counters synced in Directus asynchronously
    fetch(`${API_BASE_URL}/items/asset_count_sessions/${sessionId}`, {
      method: "PATCH",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        expected_count: expectedCount,
        found_count: foundCount,
        missing_count: missingCount,
        misplaced_count: misplacedCount,
        derecognised_found_count: derecognisedCount,
        unknown_count: unknownCount,
        untagged_count: untaggedCount,
        accuracy_percent: accuracyPercent,
      }),
    }).catch(() => {});

    const session: CountSession = {
      id: rawSession.id,
      name: rawSession.name,
      count_date: rawSession.count_date ? rawSession.count_date.slice(0, 10) : "",
      method_id: Number(rawSession.method_id || 1),
      method_name: Number(rawSession.method_id) === 2 ? "Manual" : "RFID",
      location_filter: rawSession.location_filter || null,
      status_id: Number(rawSession.status_id || 1),
      status:
        Number(rawSession.status_id) === 2
          ? "Completed"
          : Number(rawSession.status_id) === 3
          ? "Cancelled"
          : "In progress",
      started_by: Number(rawSession.started_by || 24),
      counted_by_name: userMap.get(Number(rawSession.started_by)) || "Andrei Siapno",
      started_at: rawSession.started_at || "",
      completed_by: rawSession.completed_by ? Number(rawSession.completed_by) : null,
      completed_at: rawSession.completed_at || null,
      expected_count: expectedCount,
      found_count: foundCount,
      missing_count: missingCount,
      misplaced_count: misplacedCount,
      derecognised_found_count: derecognisedCount,
      unknown_count: unknownCount,
      untagged_count: untaggedCount,
      accuracy_percent: accuracyPercent,
      departments: scopedDeptNames,
      remarks: rawSession.remarks || null,
    };

    return NextResponse.json({
      session,
      items,
      expectedAssets,
      recentReads,
    });
  } catch (error: unknown) {
    console.error("GET Count Session Detail Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
