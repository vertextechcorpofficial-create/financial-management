import { NextResponse } from "next/server";
import { completeDisposal, decideDisposal } from "@/modules/financial-management/barangay-asset-inventory-system/disposal/services/brgyDisposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const requestId = Number(id);
    const body = await req.json();
    switch (body?.action) {
      case "approve":
        return NextResponse.json(
          await decideDisposal({ requestId, decision: "approve", remark: body.remark ?? null, actor: body.actor ?? null, actorRole: body.actorRole ?? null })
        );
      case "return":
        return NextResponse.json(
          await decideDisposal({ requestId, decision: "return", remark: body.remark ?? null, actor: body.actor ?? null, actorRole: body.actorRole ?? null })
        );
      case "complete":
        return NextResponse.json(
          await completeDisposal({ requestId, method: body.method ?? "condemned", note: body.note ?? null, actor: body.actor ?? null })
        );
      default:
        return NextResponse.json({ message: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
