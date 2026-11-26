import { NextResponse } from "next/server";
import { fetchAsset } from "@/modules/financial-management/barangay-asset-inventory-system/assets/services/brgyAssets";

import { requireBarangayScope, requirePermission, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const access = await resolveAccess();
    const detail = await fetchAsset(Number(id));
    requireBarangayScope(access, detail.asset.barangay_id, "view");
    requirePermission(access, "view", "view an asset");
    return NextResponse.json(detail);
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 404 });
  }
}
