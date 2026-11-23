import { NextRequest, NextResponse } from "next/server";
import { proxySpring } from "../../adjusting-journal-entries/_spring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startDate = request.nextUrl.searchParams.get("startDate")?.trim();
  const endDate = request.nextUrl.searchParams.get("endDate")?.trim();
  const activity = request.nextUrl.searchParams.get("activity")?.trim();
  const coaId = request.nextUrl.searchParams.get("coaId")?.trim();
  const page = request.nextUrl.searchParams.get("page")?.trim() || "0";
  const size = request.nextUrl.searchParams.get("size")?.trim() || "25";

  if (!startDate || !endDate) {
    return NextResponse.json(
      { message: "Both startDate and endDate are required.", success: false },
      { status: 400 },
    );
  }

  const query = new URLSearchParams({ startDate, endDate, page, size });
  if (activity) query.set("activity", activity);
  if (coaId) query.set("coaId", coaId);

  return proxySpring(`/api/view-fs-report-statement-cash-flow/entries?${query.toString()}`);
}
