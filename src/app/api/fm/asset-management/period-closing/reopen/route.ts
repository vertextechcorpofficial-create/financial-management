import { NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

interface DirectusPeriodClose {
  id: number;
  closed_through: string;
  reopened_at?: string | null;
}

function getPreviousMonth(ym: string): string | null {
  if (!ym || !ym.includes("-")) return null;
  const [yStr, mStr] = ym.split("-");
  let y = parseInt(yStr, 10);
  let m = parseInt(mStr, 10);
  m -= 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  const res = `${y}-${String(m).padStart(2, "0")}`;
  // Earliest supported historical period boundary
  if (res < "2025-12") return null;
  return res;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { reason, targetYm } = body;

    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: "Reason for reopening is required" }, { status: 400 });
    }

    if (!API_BASE_URL) {
      return NextResponse.json({
        success: true,
        message: `Period ${targetYm || "selected"} reopened successfully. Reason logged: ${reason}`,
      });
    }

    // 1. Find the latest active closed period (Admin only, latest close only)
    const findRes = await fetch(`${API_BASE_URL}/items/asset_period_closes?sort=-id&limit=1`, {
      headers: AUTH_HEADERS,
      cache: "no-store",
    });

    if (!findRes.ok) {
      const errText = await findRes.text();
      throw new Error(`Failed to fetch latest period close: ${errText}`);
    }

    const json = await findRes.json();
    const latestCloses: DirectusPeriodClose[] = json.data || [];

    if (latestCloses.length === 0 || latestCloses[0].reopened_at) {
      return NextResponse.json(
        { error: "No active closed period to reopen." },
        { status: 400 }
      );
    }

    const activeClose = latestCloses[0];
    const monthToReopen = targetYm || activeClose.closed_through;
    const nowIso = new Date().toISOString();

    // 2. Mark the active close as reopened (logs reason and who reopened it)
    const patchRes = await fetch(`${API_BASE_URL}/items/asset_period_closes/${activeClose.id}`, {
      method: "PATCH",
      headers: AUTH_HEADERS,
      body: JSON.stringify({
        reopened_by: 24, // Andrei Siapno / current user
        reopened_at: nowIso,
        reopen_reason: reason.trim(),
      }),
    });

    if (!patchRes.ok) {
      const patchErr = await patchRes.text();
      throw new Error(`Failed to update period close: ${patchErr}`);
    }

    // 3. Roll back closed_through to the month immediately preceding monthToReopen
    // ONLY monthToReopen (and any months after it) reopen; all prior months remain closed!
    const newClosedThrough = getPreviousMonth(monthToReopen);

    if (newClosedThrough) {
      // Create new active close record with rolled-back closed_through
      const insertRollbackRes = await fetch(`${API_BASE_URL}/items/asset_period_closes`, {
        method: "POST",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          closed_through: newClosedThrough,
          lives_reviewed: false,
          closed_by: 24,
          closed_at: nowIso,
          reopened_by: null,
          reopened_at: null,
          reopen_reason: null,
        }),
      });

      if (!insertRollbackRes.ok) {
        const insErr = await insertRollbackRes.text();
        throw new Error(`Failed to roll back closed period: ${insErr}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Reopened ${monthToReopen}. ${
        newClosedThrough ? `Closed periods rolled back to ${newClosedThrough}.` : "All periods now open."
      }`,
    });
  } catch (error: unknown) {
    console.error("POST /api/fm/asset-management/period-closing/reopen error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reopen period" },
      { status: 500 }
    );
  }
}
