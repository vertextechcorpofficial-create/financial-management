import { NextResponse } from "next/server";
import { readDocumentScan } from "@/modules/financial-management/lgu-asset-management-system/custody/services/assetCustody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return await readDocumentScan(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 404 });
  }
}
