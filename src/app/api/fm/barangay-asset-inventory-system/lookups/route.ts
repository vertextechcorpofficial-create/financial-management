import { NextResponse } from "next/server";
import { fetchLookups } from "@/modules/financial-management/barangay-asset-inventory-system/assets/services/brgyAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const barangayId = searchParams.get("barangayId");
    return NextResponse.json(await fetchLookups(barangayId ? Number(barangayId) : null));
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
