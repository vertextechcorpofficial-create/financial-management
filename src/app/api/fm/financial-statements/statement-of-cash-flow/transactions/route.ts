import { NextRequest, NextResponse } from "next/server";
import {
  resolveTargetRouting,
  fetchFromTargetSpring,
} from "@/modules/financial-management/financial-statements/statement-of-cash-flows/services/company-proxy.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const journalEntryId = request.nextUrl.searchParams.get("journalEntryId")?.trim();
  const sourceModule = request.nextUrl.searchParams.get("sourceModule")?.trim();
  const companyCode = request.nextUrl.searchParams.get("companyCode")?.trim();

  if (!journalEntryId || !sourceModule) {
    return NextResponse.json(
      { message: "Both journalEntryId and sourceModule are required." },
      { status: 400 },
    );
  }

  const query = new URLSearchParams({ journalEntryId, sourceModule });
  const targetCompany = companyCode?.toUpperCase() === "GRP" ? "MEN2" : companyCode;

  const routing = await resolveTargetRouting(targetCompany);
  if (routing instanceof NextResponse) {
    return routing;
  }

  const endpointPath = `/api/view-fs-report-statement-cash-flow/transactions?${query.toString()}`;
  const response = await fetchFromTargetSpring(routing, endpointPath);
  const data = await response.json();

  return NextResponse.json(data, { status: response.status });
}
