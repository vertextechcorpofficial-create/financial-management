import { NextResponse } from "next/server";
import { fetchAsset } from "@/modules/financial-management/barangay-asset-inventory-system/assets/services/brgyAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return NextResponse.json(await fetchAsset(Number(id)));
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 404 });
  }
}
