import { NextResponse } from "next/server";
import { resolveCountLine } from "@/modules/financial-management/lgu-asset-management-system/physical-count/services/assetCount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  lineId: number;
  resolution: "missing" | "moved";
  toOfficeId?: number | null;
  toOfficer?: string | null;
  locationSeen?: string | null;
  remarks?: string | null;
  encoder?: string | null;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as Body;
    if (body.resolution !== "missing" && body.resolution !== "moved") {
      return NextResponse.json({ message: "resolution must be missing or moved" }, { status: 400 });
    }
    if (!body.lineId) return NextResponse.json({ message: "lineId is required" }, { status: 400 });
    const detail = await resolveCountLine({ ...body, countId: Number(id) });
    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 409 });
  }
}
