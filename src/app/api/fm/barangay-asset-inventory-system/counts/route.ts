import { NextResponse } from "next/server";
import { listCounts, openCount } from "@/modules/financial-management/barangay-asset-inventory-system/count/services/brgyCount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const barangayId = Number(searchParams.get("barangayId"));
    if (!barangayId) return NextResponse.json({ message: "barangayId is required" }, { status: 400 });
    return NextResponse.json({ counts: await listCounts(barangayId) });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
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
