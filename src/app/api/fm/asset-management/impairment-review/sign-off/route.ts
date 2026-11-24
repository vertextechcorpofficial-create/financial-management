import { NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const AUTH_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}`,
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { review_id?: number };
    const reviewId = body.review_id;
    if (!reviewId) {
      return NextResponse.json({ error: "review_id is required" }, { status: 400 });
    }

    if (API_BASE_URL) {
      await fetch(`${API_BASE_URL}/items/asset_impairment_reviews/${reviewId}`, {
        method: "PATCH",
        headers: AUTH_HEADERS,
        body: JSON.stringify({
          status_id: 2, // SIGNED
          signed_at: new Date().toISOString(),
          signed_by: 24,
        }),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("POST /api/fm/asset-management/impairment-review/sign-off error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
