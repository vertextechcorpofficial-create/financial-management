import { NextRequest, NextResponse } from "next/server";
import { proxySpring } from "../../adjusting-journal-entries/_spring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startDate = request.nextUrl.searchParams.get("startDate")?.trim();
  const endDate = request.nextUrl.searchParams.get("endDate")?.trim();
  const groupBy = request.nextUrl.searchParams.get("groupBy")?.trim() || "month";

  if (!startDate || !endDate) {
    return NextResponse.json(
      { message: "Both startDate and endDate are required.", success: false },
      { status: 400 },
    );
  }

  const query = new URLSearchParams({ startDate, endDate, groupBy });
  return proxySpring(`/api/view-fs-report-statement-cash-flow/summary?${query.toString()}`);
}
