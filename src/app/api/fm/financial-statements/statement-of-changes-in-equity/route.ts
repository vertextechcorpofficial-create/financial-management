import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { aggregateLiveSCEData } from "@/modules/financial-management/financial-statements/statement-of-changes-in-equity/engine/live-aggregator";
import { fetchAllEquityLedgerEntries, MasterLedgerEntry } from "@/modules/financial-management/financial-statements/statement-of-changes-in-equity/services/sce-backend.service";
import { SCEFilterState, SCEViewBy, SCEPriorPeriodBasis, SCECompareMode } from "@/modules/financial-management/financial-statements/statement-of-changes-in-equity/types";
import { computeDateRange, getComparisonDateRange } from "@/modules/financial-management/financial-statements/statement-of-changes-in-equity/utils/periods";

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

    // Determine comparison date boundaries if compare is active
    let compStartDate: string | undefined = undefined;
    let compEndDate: string | undefined = undefined;
    let comparisonLabel: string | undefined = undefined;

    if (compare) {
      const mode = compareMode === "same_period_last_year" ? "same_period_last_year" : "previous_period";
      const compRange = getComparisonDateRange(range.startDate, range.endDate, mode);
      compStartDate = compRange.startDate;
      compEndDate = compRange.endDate;
      const compDerived = computeDateRange(viewBy, compRange.endDate);
      comparisonLabel = compDerived.label;
    }

    // ─── PERFORMANCE OPTIMIZATION: 1 SINGLE INCEPTION QUERY ───
    // Instead of firing 4 separate queries across 26 years sequentially,
    // determine the maximum end date and execute 1 single master query from 2000-01-01.
    const maxEndDate = compEndDate && compEndDate > range.endDate ? compEndDate : range.endDate;
    const allInceptionEntries = await fetchAllEquityLedgerEntries("2000-01-01", maxEndDate, token);

    // In-memory partitioning (fast, sub-millisecond)
    const getDate = (e: MasterLedgerEntry) => e.transactionDate || e.postingDate || "";

    const livePeriodEntries = allInceptionEntries.filter((e) => {
      const d = getDate(e);
      return d >= range.startDate && d <= range.endDate;
    });

    const priorEntries = allInceptionEntries.filter((e) => {
      const d = getDate(e);
      return d < range.startDate;
    });

    let comparisonEntries: MasterLedgerEntry[] | undefined = undefined;
    let comparisonPriorEntries: MasterLedgerEntry[] | undefined = undefined;

    if (compare && compStartDate && compEndDate) {
      comparisonEntries = allInceptionEntries.filter((e) => {
        const d = getDate(e);
        return d >= compStartDate! && d <= compEndDate!;
      });
      comparisonPriorEntries = allInceptionEntries.filter((e) => {
        const d = getDate(e);
        return d < compStartDate!;
      });
    }

    // Aggregate strictly live database records (returns clean 0 / — if no records exist)
    const liveData = aggregateLiveSCEData(
      livePeriodEntries,
      filters,
      priorEntries,
      comparisonEntries,
      comparisonPriorEntries,
      comparisonLabel
    );

    return NextResponse.json(liveData);
  } catch (error: unknown) {
    console.error("[SCE API Route] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
