import { NextResponse } from "next/server";
import { fetchCount } from "@/modules/financial-management/barangay-asset-inventory-system/count/services/brgyCount";

import { requireBarangayScope, requirePermission, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const access = await resolveAccess();
    const detail = await fetchCount(Number(id));
    requireBarangayScope(access, detail.count.barangay_id, "view");
    requirePermission(access, "view", "view a count");
    return NextResponse.json(detail);
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 404 });
  }
}
