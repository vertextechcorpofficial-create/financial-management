import { NextResponse } from "next/server";
import {
  accountability,
  consolidation,
  countSummary,
  masterlist,
} from "@/modules/financial-management/barangay-asset-inventory-system/reports/services/brgyReports";


import { AccessError, requireBarangayScope, requirePermission, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind") ?? "masterlist";
    const access = await resolveAccess();
    requirePermission(access, "reports", "read reports");
    if (kind === "consolidation") {
      if (access.role !== "municipal" && access.role !== "system_admin") {
        throw new AccessError("Municipal consolidation is for the Municipal Property and Accounting Offices.", 403);
      }
      return NextResponse.json(await consolidation());
    }
    const barangayId = requireBarangayScope(access, Number(searchParams.get("barangayId")), "view");
    if (kind === "accountability") return NextResponse.json(await accountability(barangayId));
    if (kind === "count") {
      const countId = Number(searchParams.get("countId"));
      if (!countId) return NextResponse.json({ message: "countId is required" }, { status: 400 });
      return NextResponse.json(await countSummary(countId));
    }
    return NextResponse.json(await masterlist(barangayId));
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ message: err.message }, { status: err.status });
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
