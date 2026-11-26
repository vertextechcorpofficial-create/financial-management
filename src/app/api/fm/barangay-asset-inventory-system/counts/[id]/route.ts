import { NextResponse } from "next/server";
import { fetchCount } from "@/modules/financial-management/barangay-asset-inventory-system/count/services/brgyCount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return NextResponse.json(await fetchCount(Number(id)));
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 404 });
  }
}
