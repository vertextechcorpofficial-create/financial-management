import { NextResponse } from "next/server";
import {
  appendAuditLog,
  fetchUsers,
  getDefaultUserId,
} from "@/modules/financial-management/asset-management/registration/services/asset";

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

export async function POST(req: Request) {
  try {
    if (!API_BASE_URL) {
      return NextResponse.json({ error: "Directus API URL is not configured." }, { status: 500 });
    }

    const body = (await req.json()) as {
      employeeId?: number;
      lastDay?: string;
      reason?: string;
    };

    const employeeId = Number(body.employeeId);
    const lastDay = String(body.lastDay || "").trim();
    const reason = String(body.reason || "").trim();

    if (!employeeId) {
      return NextResponse.json({ error: "employeeId is required." }, { status: 400 });
    }
    if (!lastDay) {
      return NextResponse.json({ error: "Last working day is required." }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "Clearance reason is required." }, { status: 400 });
    }

    const [users, recorderId] = await Promise.all([fetchUsers(), getDefaultUserId()]);
    const targetUser = users.find((u) => u.user_id === employeeId);
    const empName = targetUser
      ? `${targetUser.user_fname} ${targetUser.user_lname}`.trim()
      : `Employee #${employeeId}`;

    // Check if an open clearance_request already exists for this employee
    const existingRes = await fetch(
      `${API_BASE_URL}/items/clearance_request?filter[employee_id][_eq]=${employeeId}&sort=-id&limit=1`,
      { headers: AUTH_HEADERS, cache: "no-store" }
    );

    if (existingRes.ok) {
      const existingJson = (await existingRes.json()) as { data?: Array<Record<string, unknown>> };
      const latest = existingJson.data?.[0];
      if (latest && String(latest.status || "").toLowerCase() !== "cleared") {
        return NextResponse.json(
          { error: `${empName} is already in clearance.` },
          { status: 409 }
        );
      }
    }

    // Create clearance_request in Directus
    const createPayload = {
      employee_id: employeeId,
      status: "in_clearance",
      last_day: lastDay,
      reason,
      created_by: recorderId,
    };

    let createRes = await fetch(`${API_BASE_URL}/items/clearance_request`, {
      method: "POST",
      headers: AUTH_HEADERS,
      body: JSON.stringify(createPayload),
    });

    // Fallback if HRM clearance_request uses slightly different optional column names
    if (!createRes.ok) {
      createRes = await fetch(`${API_BASE_URL}/items/clearance_request`, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          employee_id: employeeId,
          status: "in_clearance",
        }),
      });
    }

    const createJson = (await createRes.json().catch(() => ({}))) as {
      data?: { id?: number };
    };

    if (!createRes.ok) {
      return NextResponse.json(
        { error: extractError(createJson, "Failed to create clearance request in database.") },
        { status: 400 }
      );
    }

    const clearanceRequestId = createJson.data?.id ? Number(createJson.data.id) : null;

    // Append audit log: 12 = CLEARANCE_STARTED
    await appendAuditLog({
      action_id: 12,
      asset_id: null,
      user_id: recorderId,
      details: `Started employee clearance for ${empName} (last working day: ${lastDay}). Reason: ${reason}`,
    });

    return NextResponse.json({
      success: true,
      clearance_request_id: clearanceRequestId,
    });
  } catch (error: unknown) {
    console.error("POST /api/fm/asset-management/employee-clearance/start error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start clearance." },
      { status: 500 }
    );
  }
}
