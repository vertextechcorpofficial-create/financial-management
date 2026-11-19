import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { aggregateLiveSCEData } from "@/modules/financial-management/financial-statements/statement-of-changes-in-equity/engine/live-aggregator";
import { fetchAllEquityLedgerEntries } from "@/modules/financial-management/financial-statements/statement-of-changes-in-equity/services/sce-backend.service";
import { SCEFilterState, SCEViewBy, SCEPriorPeriodBasis, SCECompareMode } from "@/modules/financial-management/financial-statements/statement-of-changes-in-equity/types";
import { computeDateRange } from "@/modules/financial-management/financial-statements/statement-of-changes-in-equity/utils/periods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "vos_access_token";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const viewBy = (searchParams.get("viewBy") as SCEViewBy) || "Monthly";
    const periodDate = searchParams.get("periodDate") || "2026-10-31";
    const divisionId = searchParams.get("divisionId") || "all";
    const departmentId = searchParams.get("departmentId") || "all";
    const basis = (searchParams.get("basis") as SCEPriorPeriodBasis) || "restated";
    const compare = searchParams.get("compare") === "true";
    const compareMode = (searchParams.get("compareMode") as SCECompareMode) || "previous_period";

    const range = computeDateRange(viewBy, periodDate);

    const filters: SCEFilterState = {
      viewBy,
      periodDate,
      periodLabel: range.label,
      startDate: range.startDate,
      endDate: range.endDate,
      daysCount: range.daysCount,
      compare,
      compareMode,
      divisionId,
      departmentId,
      basis,
    };

    // Extract vos_access_token from cookies
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    // Fetch live entries from backend using process.env.SPRING_API_BASE_URL (http://goatedcodoer:8083)
    const liveEntries = await fetchAllEquityLedgerEntries(range.startDate, range.endDate, token);

    // Aggregate strictly live database records (returns clean 0 / — if no records exist)
    const liveData = aggregateLiveSCEData(liveEntries || [], filters);
    return NextResponse.json(liveData);
  } catch (error: unknown) {
    console.error("[SCE API Route] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
