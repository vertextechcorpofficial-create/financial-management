import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { fetchEntriesForAccount } from "@/modules/financial-management/financial-statements/statement-of-changes-in-equity/services/sce-backend.service";
import { SCEJournalLine } from "@/modules/financial-management/financial-statements/statement-of-changes-in-equity/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "vos_access_token";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const glCode = searchParams.get("glCode") || "";
    const startDate = searchParams.get("startDate") || "2026-10-01";
    const endDate = searchParams.get("endDate") || "2026-10-31";

    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;

    // Fetch live entries for this accountNumber
    const liveEntries = await fetchEntriesForAccount(glCode, startDate, endDate, token);

    const lines: SCEJournalLine[] = (liveEntries || []).map((e, index) => ({
      id: `jl-live-${index}`,
      date: e.transactionDate || e.postingDate || startDate,
      jeNo: e.jeNo,
      description: e.description || "General Ledger Entry",
      glCode: e.accountNumber || glCode,
      accountTitle: e.accountTitle || "",
      debit: e.debit || 0,
      credit: e.credit || 0,
      netAmount: (e.credit || 0) - (e.debit || 0),
      sceMovement: "unmapped",
      division: e.divisionName || e.division || null,
      department: e.departmentName || e.department || null,
    }));

    return NextResponse.json({
      glCode,
      lines,
      totalCount: lines.length,
    });
  } catch (error: unknown) {
    console.error("[SCE Transactions API Route] Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
