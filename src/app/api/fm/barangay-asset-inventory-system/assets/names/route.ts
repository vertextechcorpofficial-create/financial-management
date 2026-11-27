import { NextResponse } from "next/server";
import { listAssetNames } from "@/modules/financial-management/barangay-asset-inventory-system/assets/services/brgyAssets";
import { AccessError, requireBarangayScope, requirePermission, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const access = await resolveAccess();
    const barangayId = requireBarangayScope(access, Number(searchParams.get("barangayId")), "view");
    requirePermission(access, "view", "read item names");
    return NextResponse.json({ names: await listAssetNames(barangayId) });
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ message: err.message }, { status: err.status });
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
