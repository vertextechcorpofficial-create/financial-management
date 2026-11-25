import { NextResponse } from "next/server";
import {
  appendAuditLog,
  fetchAssets,
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
      clearanceRequestId?: number | null;
    };

    const employeeId = Number(body.employeeId);
    if (!employeeId) {
      return NextResponse.json({ error: "employeeId is required." }, { status: 400 });
    }

    // PDF §16: "Issue clearance" is available only when the employee holds nothing
    const [assets, users, recorderId] = await Promise.all([
      fetchAssets(),
      fetchUsers(),
      getDefaultUserId(),
    ]);

    const remainingAssets = assets.filter(
      (a) => Number(a.employee) === employeeId && a.record_status === "active"
    );

    if (remainingAssets.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot issue clearance: employee still holds ${remainingAssets.length} active asset(s). Process all items first.`,
        },
        { status: 400 }
      );
    }

    const targetUser = users.find((u) => u.user_id === employeeId);
    const empName = targetUser
      ? `${targetUser.user_fname} ${targetUser.user_lname}`.trim()
      : `Employee #${employeeId}`;

    // Locate clearance_request record
    let requestId = body.clearanceRequestId ? Number(body.clearanceRequestId) : null;
    if (!requestId) {
      const findRes = await fetch(
        `${API_BASE_URL}/items/clearance_request?filter[employee_id][_eq]=${employeeId}&sort=-id&limit=1`,
        { headers: AUTH_HEADERS, cache: "no-store" }
      );
      if (findRes.ok) {
        const findJson = (await findRes.json()) as { data?: Array<{ id?: number }> };
        if (findJson.data?.[0]?.id) {
          requestId = Number(findJson.data[0].id);
        }
      }
    }

    const clearedAt = new Date().toISOString().slice(0, 19).replace("T", " ");

    if (requestId) {
      let patchRes = await fetch(`${API_BASE_URL}/items/clearance_request/${requestId}`, {
        method: "PATCH",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          status: "cleared",
          cleared_by: recorderId,
          cleared_at: clearedAt,
        }),
      });

      if (!patchRes.ok) {
        patchRes = await fetch(`${API_BASE_URL}/items/clearance_request/${requestId}`, {
          method: "PATCH",
          headers: AUTH_HEADERS,
          body: JSON.stringify({ status: "cleared" }),
        });
      }

      if (!patchRes.ok) {
        const errJson = await patchRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: extractError(errJson, "Failed to update clearance request status in database.") },
          { status: 400 }
        );
      }
    } else {
      const createRes = await fetch(`${API_BASE_URL}/items/clearance_request`, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          employee_id: employeeId,
          status: "cleared",
        }),
      });
      if (!createRes.ok) {
        const errJson = await createRes.json().catch(() => ({}));
        return NextResponse.json(
          { error: extractError(errJson, "Failed to save cleared status in database.") },
          { status: 400 }
        );
      }
    }

    // Append audit log: 13 = EMPLOYEE_CLEARED
    await appendAuditLog({
      action_id: 13,
      asset_id: null,
      user_id: recorderId,
      details: `Issued clearance for ${empName}. Status set to Cleared.`,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("POST /api/fm/asset-management/employee-clearance/issue error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to issue clearance." },
      { status: 500 }
    );
  }
}
