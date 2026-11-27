import { NextRequest, NextResponse } from "next/server";
import {
  resolveTargetRouting,
  fetchFromTargetSpring,
} from "@/modules/financial-management/financial-statements/statement-of-cash-flows/services/company-proxy.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startDate = request.nextUrl.searchParams.get("startDate")?.trim();
  const endDate = request.nextUrl.searchParams.get("endDate")?.trim();
  const activity = request.nextUrl.searchParams.get("activity")?.trim();
  const coaId = request.nextUrl.searchParams.get("coaId")?.trim();
  const page = request.nextUrl.searchParams.get("page")?.trim() || "0";
  const size = request.nextUrl.searchParams.get("size")?.trim() || "25";
  const companyCode = request.nextUrl.searchParams.get("companyCode")?.trim();

  if (!startDate || !endDate) {
    return NextResponse.json(
      { message: "Both startDate and endDate are required.", success: false },
      { status: 400 },
    );
  }

  const query = new URLSearchParams({ startDate, endDate, page, size });
  if (activity) query.set("activity", activity);
  if (coaId) query.set("coaId", coaId);

  // If GRP is passed to entries, default to MEN2 or own company
  const targetCompany = companyCode?.toUpperCase() === "GRP" ? "MEN2" : companyCode;

  const routing = await resolveTargetRouting(targetCompany);
  if (routing instanceof NextResponse) {
    return routing;
  }

  const endpointPath = `/api/view-fs-report-statement-cash-flow/entries?${query.toString()}`;
  const response = await fetchFromTargetSpring(routing, endpointPath);
  const data = await response.json();

  return NextResponse.json(data, { status: response.status });
}
