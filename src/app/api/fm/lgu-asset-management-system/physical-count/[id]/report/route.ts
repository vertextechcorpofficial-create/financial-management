import { NextResponse } from "next/server";
import { buildCountReport } from "@/modules/financial-management/lgu-asset-management-system/physical-count/services/assetCount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const form = searchParams.get("form") === "rpcsp" ? "rpcsp" : "rpcppe";
    return NextResponse.json(await buildCountReport(Number(id), form));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
