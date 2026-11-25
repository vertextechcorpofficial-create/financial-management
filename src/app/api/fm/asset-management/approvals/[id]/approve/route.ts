import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  appendAuditLog,
  fetchUsers,
} from "@/modules/financial-management/asset-management/registration/services/asset";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

function extractUserIdFromJwt(token?: string | null): number | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
    const raw = payload.user_id ?? payload.userId ?? payload.sub ?? payload.id;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
  } catch {
    return null;
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!API_BASE_URL) {
      return NextResponse.json({ error: "API_BASE_URL is not configured." }, { status: 500 });
    }

    // 1. Fetch existing event from Directus to verify status & maker_id
    const evRes = await fetch(`${API_BASE_URL}/items/asset_events/${id}`, {
      headers: AUTH_HEADERS,
      cache: "no-store",
    });
    if (!evRes.ok) {
      return NextResponse.json({ error: `Event #${id} not found in database.` }, { status: 404 });
    }
    const evJson = (await evRes.json()) as {
      data?: {
        id: number;
        asset_id: number;
        event_type_id: number;
        status_id: number;
        maker_id: number;
        new_remaining_months?: number | null;
        new_residual_value?: number | string | null;
        row_version?: number | null;
      };
    };
    const ev = evJson.data;
    if (!ev) {
      return NextResponse.json({ error: `Event #${id} not found in database.` }, { status: 404 });
    }
    if (ev.status_id !== 1) {
      return NextResponse.json(
        { error: `Event #${id} is no longer pending approval.` },
        { status: 400 }
      );
    }

    // 2. Resolve checker_id (enforce maker-checker rule: checker_id !== maker_id)
    const cookieStore = await cookies();
    const jwtUserId = extractUserIdFromJwt(cookieStore.get("vos_access_token")?.value);
    let checkerId = jwtUserId;

    if (checkerId && checkerId === ev.maker_id) {
      return NextResponse.json(
        { error: "Maker-checker violation: the person who created this entry cannot approve it." },
        { status: 403 }
      );
    }

    if (!checkerId) {
      const users = await fetchUsers();
      const otherUser = users.find((u) => u.user_id !== ev.maker_id);
      if (!otherUser) {
        return NextResponse.json(
          { error: "No eligible second user found to act as checker." },
          { status: 400 }
        );
      }
      checkerId = otherUser.user_id;
    }

    // 3. PATCH asset_events (status_id = 2 APPROVED, MySQL-safe datetime)
    const checkedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    const patchRes = await fetch(`${API_BASE_URL}/items/asset_events/${id}`, {
      method: "PATCH",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        status_id: 2,
        checker_id: checkerId,
        checked_at: checkedAt,
        row_version: Number(ev.row_version || 0) + 1,
      }),
    });

    if (!patchRes.ok) {
      const errorData = (await patchRes.json().catch(() => ({}))) as {
        errors?: Array<{ message?: string }>;
      };
      return NextResponse.json(
        { error: errorData.errors?.[0]?.message || `Failed to approve event #${id} in database.` },
        { status: 400 }
      );
    }

    // 4. Sync asset fields if approved event is a Change in Estimate (event_type_id === 3)
    if (ev.event_type_id === 3 && (ev.new_remaining_months || ev.new_residual_value !== null)) {
      const assetPatch: Record<string, unknown> = {};
      if (ev.new_remaining_months) {
        assetPatch.life_months = Number(ev.new_remaining_months);
        assetPatch.life_span = Math.max(1, Math.round(Number(ev.new_remaining_months) / 12));
      }
      if (ev.new_residual_value !== null && ev.new_residual_value !== undefined) {
        assetPatch.residual_value = Number(ev.new_residual_value);
      }
      await fetch(`${API_BASE_URL}/items/assets_and_equipment/${ev.asset_id}`, {
        method: "PATCH",
        headers: AUTH_HEADERS,
        body: JSON.stringify(assetPatch),
      }).catch(() => {});
    }

    // 5. Append audit log (action_id = 6 APPROVED)
    await appendAuditLog({
      action_id: 6,
      asset_id: ev.asset_id,
      user_id: checkerId,
      details: `Approved accounting event #${id}`,
    });

    return NextResponse.json({
      success: true,
      message: `Event #${id} approved.`,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approval failed" },
      { status: 500 }
    );
  }
}
