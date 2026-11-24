import { NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = body.reason || "Rejected by checker";

    if (API_BASE_URL) {
      // Directus asset_events status_id: 3 = REJECTED
      const patchRes = await fetch(`${API_BASE_URL}/items/asset_events/${id}`, {
        method: "PATCH",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          status_id: 3,
          checked_at: new Date().toISOString(),
          reject_reason: reason,
        }),
      });

      if (!patchRes.ok) {
        const errorData = await patchRes.json().catch(() => ({}));
        console.warn("Directus reject PATCH error:", errorData);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Event #${id} rejected: ${reason}`,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Rejection failed" },
      { status: 500 }
    );
  }
}
