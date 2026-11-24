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

    if (API_BASE_URL) {
      // Directus asset_events status_id: 2 = APPROVED
      const patchRes = await fetch(`${API_BASE_URL}/items/asset_events/${id}`, {
        method: "PATCH",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          status_id: 2,
          checked_at: new Date().toISOString(),
        }),
      });

      if (!patchRes.ok) {
        const errorData = await patchRes.json().catch(() => ({}));
        console.warn("Directus approve PATCH error:", errorData);
      }
    }

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
