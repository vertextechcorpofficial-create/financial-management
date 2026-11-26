import { NextResponse } from "next/server";
import { listCounts, openCount } from "@/modules/financial-management/barangay-asset-inventory-system/count/services/brgyCount";


import { requireBarangayScope, requirePermission, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const access = await resolveAccess();
    const barangayId = requireBarangayScope(access, Number(searchParams.get("barangayId")), "view");
    requirePermission(access, "view", "view counts");
    return NextResponse.json({ counts: await listCounts(barangayId) });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const access = await resolveAccess();
    requirePermission(access, "count", "open a count");
    requireBarangayScope(access, Number(body.barangayId), "count");
    const count = await openCount({
      barangayId: Number(body.barangayId),
      year: Number(body.year ?? new Date().getFullYear()),
      actor: body.actor ?? null,
      remarks: body.remarks ?? null,
    });
    return NextResponse.json(count, { status: 201 });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
