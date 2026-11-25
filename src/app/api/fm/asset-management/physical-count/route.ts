import { NextResponse } from "next/server";
import type {
  CountSession,
  PhysicalCountOverviewData,
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
  expected_count?: number | null;
  found_count?: number | null;
  missing_count?: number | null;
  misplaced_count?: number | null;
  derecognised_found_count?: number | null;
  unknown_count?: number | null;
  untagged_count?: number | null;
  accuracy_percent?: number | string | null;
  remarks?: string | null;
}

interface DirectusSessionDept {
  id: number;
  session_id: number;
  department_id: number;
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

interface DirectusAsset {
  id: number;
  asset_tag?: string | null;
  department?: number | null;
  record_status_id?: number | null;
  is_active?: number | boolean | null;
}

interface DirectusResult {
  id: number;
  session_id: number;
  asset_id?: number | null;
  result_type_id: number;
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

export async function GET() {
  try {
    const [rawSessions, sessionDepts, depts, users, assets, results] = await Promise.all([
      safeList<DirectusSession>("/items/asset_count_sessions?sort=-id&limit=100"),
      safeList<DirectusSessionDept>("/items/asset_count_session_departments?limit=500"),
      safeList<DirectusDept>("/items/department?limit=200"),
      safeList<DirectusUser>("/items/user?limit=500"),
      safeList<DirectusAsset>("/items/assets_and_equipment?limit=500"),
      safeList<DirectusResult>("/items/asset_count_results?limit=1000"),
    ]);

    const deptMap = new Map<number, string>(
      depts.map((d) => [d.department_id, d.department_name || `Dept #${d.department_id}`])
    );
    const userMap = new Map<number, string>(
      users.map((u) => [
        u.user_id,
        `${u.user_fname || ""} ${u.user_lname || ""}`.trim() || `User #${u.user_id}`,
      ])
    );

    const deptsBySession = new Map<number, string[]>();
    for (const sd of sessionDepts) {
      const list = deptsBySession.get(sd.session_id) || [];
      const name = deptMap.get(sd.department_id);
      if (name) list.push(name);
      deptsBySession.set(sd.session_id, list);
    }

    const sessions: CountSession[] = rawSessions.map((s) => {
      const sDepts = deptsBySession.get(s.id) || [];
      return {
        id: s.id,
        name: s.name || `Count - ${s.count_date}`,
        count_date: s.count_date ? s.count_date.slice(0, 10) : "",
        method_id: Number(s.method_id || 1),
        method_name: Number(s.method_id) === 2 ? "Manual" : "RFID",
        location_filter: s.location_filter || null,
        status_id: Number(s.status_id || 1),
        status:
          Number(s.status_id) === 2
            ? "Completed"
            : Number(s.status_id) === 3
            ? "Cancelled"
            : "In progress",
        started_by: Number(s.started_by || 24),
        counted_by_name: userMap.get(Number(s.started_by)) || "Andrei Siapno",
        started_at: s.started_at || "",
        completed_by: s.completed_by ? Number(s.completed_by) : null,
        completed_at: s.completed_at || null,
        expected_count: Number(s.expected_count || 0),
        found_count: Number(s.found_count || 0),
        missing_count: Number(s.missing_count || 0),
        misplaced_count: Number(s.misplaced_count || 0),
        derecognised_found_count: Number(s.derecognised_found_count || 0),
        unknown_count: Number(s.unknown_count || 0),
        untagged_count: Number(s.untagged_count || 0),
        accuracy_percent: Number(s.accuracy_percent || 0),
        departments: sDepts.length > 0 ? sDepts : ["All Departments"],
        remarks: s.remarks || null,
      };
    });

    const totalSessions = sessions.length;
    const inProgressCount = sessions.filter((s) => s.status === "In progress").length;
    const completedSessions = sessions.filter((s) => s.status === "Completed");
    const lastCompletedDate =
      completedSessions.length > 0 ? completedSessions[0].count_date : null;

    // Assets verified in any completed session (result_type_id === 1 = FOUND)
    const completedSessionIds = new Set(completedSessions.map((s) => s.id));
    const verifiedAssetIds = new Set<number>();
    for (const r of results) {
      if (completedSessionIds.has(r.session_id) && r.result_type_id === 1 && r.asset_id) {
        verifiedAssetIds.add(r.asset_id);
      }
    }

    const activeAssets = assets.filter((a) => a.record_status_id !== 2 && a.is_active !== 0);
    const notVerifiedAssets = activeAssets
      .filter((a) => !verifiedAssetIds.has(a.id))
      .map((a) => ({
        id: a.id,
        asset_tag: a.asset_tag || `AST-${String(a.id).padStart(4, "0")}`,
      }));

    const responseData: PhysicalCountOverviewData = {
      totalSessions,
      inProgressCount,
      lastCompletedDate,
      notVerifiedCount: notVerifiedAssets.length,
      notVerifiedAssets,
      sessions,
    };

    return NextResponse.json(responseData);
  } catch (error: unknown) {
    console.error("GET Physical Count Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    if (!API_BASE_URL) {
      return NextResponse.json({ error: "Directus API URL not configured" }, { status: 500 });
    }

    const body = await req.json();
    const { name, count_date, method, location_filter, department_ids } = body as {
      name?: string;
      count_date?: string;
      method?: string;
      location_filter?: string;
      department_ids?: number[];
    };

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Count session name is required" }, { status: 400 });
    }

    const method_id = method === "Manual checklist" ? 2 : 1;
    const deptIds = Array.isArray(department_ids)
      ? department_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [];

    // Compute real expected_count from active assets in selected departments (or all active assets)
    const [assets, depts, users] = await Promise.all([
      safeList<DirectusAsset>("/items/assets_and_equipment?limit=500"),
      safeList<DirectusDept>("/items/department?limit=200"),
      safeList<DirectusUser>("/items/user?limit=20"),
    ]);

    const starterUser = users.find((u) => u.user_id === 24) || users[0];
    const startedById = starterUser?.user_id || 24;
    const starterName = starterUser
      ? `${starterUser.user_fname || ""} ${starterUser.user_lname || ""}`.trim()
      : "Andrei Siapno";

    const activeAssets = assets.filter((a) => a.record_status_id !== 2 && a.is_active !== 0);
    const expectedAssets =
      deptIds.length > 0
        ? activeAssets.filter((a) => a.department && deptIds.includes(Number(a.department)))
        : activeAssets;

    const expectedCount = expectedAssets.length;
    const nowIso = new Date().toISOString();
    const countDateVal = count_date || nowIso.slice(0, 10);

    const payload = {
      name: name.trim(),
      count_date: countDateVal,
      method_id,
      location_filter: location_filter || null,
      status_id: 1, // In progress
      started_by: startedById,
      started_at: nowIso,
      expected_count: expectedCount,
      found_count: 0,
      missing_count: expectedCount,
      misplaced_count: 0,
      derecognised_found_count: 0,
      unknown_count: 0,
      untagged_count: 0,
      accuracy_percent: expectedCount > 0 ? 0 : 100,
      row_version: 0,
    };

    const res = await fetch(`${API_BASE_URL}/items/asset_count_sessions`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Directus error creating session: ${errText}`);
    }

    const json = (await res.json()) as { data?: { id: number } };
    const createdId = json.data?.id;

    if (!createdId) {
      throw new Error("Failed to get created session ID from Directus");
    }

    // Link departments in asset_count_session_departments
    if (deptIds.length > 0) {
      const deptRows = deptIds.map((dId) => ({
        session_id: createdId,
        department_id: dId,
      }));
      await fetch(`${API_BASE_URL}/items/asset_count_session_departments`, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify(deptRows),
      });
    }

    const deptMap = new Map<number, string>(
      depts.map((d) => [d.department_id, d.department_name || `Dept #${d.department_id}`])
    );

    const newSession: CountSession = {
      id: createdId,
      name: name.trim(),
      count_date: countDateVal,
      method_id,
      method_name: method_id === 2 ? "Manual" : "RFID",
      location_filter: location_filter || null,
      status_id: 1,
      status: "In progress",
      started_by: startedById,
      counted_by_name: starterName,
      started_at: nowIso,
      expected_count: expectedCount,
      found_count: 0,
      missing_count: expectedCount,
      misplaced_count: 0,
      derecognised_found_count: 0,
      unknown_count: 0,
      untagged_count: 0,
      accuracy_percent: expectedCount > 0 ? 0 : 100,
      departments:
        deptIds.length > 0
          ? deptIds.map((id) => deptMap.get(id) || `Dept #${id}`)
          : ["All Departments"],
      remarks: null,
    };

    return NextResponse.json({ success: true, session: newSession }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST Start Count Session Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start session" },
      { status: 500 }
    );
  }
}
