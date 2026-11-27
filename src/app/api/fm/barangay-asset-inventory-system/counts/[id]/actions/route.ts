import { NextResponse } from "next/server";
import { closeCount, markCountLine, markUnrecorded } from "@/modules/financial-management/barangay-asset-inventory-system/count/services/brgyCount";
import type { BrgyCondition } from "@/modules/financial-management/barangay-asset-inventory-system/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const countId = Number(id);
    const body = await req.json();
    switch (body?.action) {
      case "mark":
        return NextResponse.json(
          await markCountLine({
            countId,
            assetId: Number(body.assetId),
            result: body.result === "not_found" ? "not_found" : "found",
            condition: (body.condition ?? null) as BrgyCondition | null,
            remarks: body.remarks ?? null,
            actor: body.actor ?? null,
          })
        );
      case "unrecorded":
        return NextResponse.json(
          await markUnrecorded({ countId, name: String(body.name ?? ""), remarks: body.remarks ?? null, actor: body.actor ?? null })
        );
      case "close":
        return NextResponse.json(await closeCount({ countId, actor: body.actor ?? null }));
      default:
        return NextResponse.json({ message: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
