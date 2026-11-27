import { NextResponse } from "next/server";
import {
  accountability,
  consolidation,
  countSummary,
  masterlist,
} from "@/modules/financial-management/barangay-asset-inventory-system/reports/services/brgyReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind") ?? "masterlist";
    if (kind === "consolidation") return NextResponse.json(await consolidation());
    const barangayId = Number(searchParams.get("barangayId"));
    if (!barangayId) return NextResponse.json({ message: "barangayId is required" }, { status: 400 });
    if (kind === "accountability") return NextResponse.json(await accountability(barangayId));
    if (kind === "count") {
      const countId = Number(searchParams.get("countId"));
      if (!countId) return NextResponse.json({ message: "countId is required" }, { status: 400 });
      return NextResponse.json(await countSummary(countId));
    }
    return NextResponse.json(await masterlist(barangayId));
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
