import { NextResponse } from "next/server";
import {
  fetchCountSheet,
  markCountLine,
} from "@/modules/financial-management/lgu-asset-management-system/physical-count/services/assetCount";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MarkBody {
  lineId?: number | null;
  assetId?: number | null;
  found: boolean;
  conditionId?: number | null;
  locationSeen?: string | null;
  remarks?: string | null;
  countedBy?: string | null;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    return NextResponse.json(
      await fetchCountSheet(Number(id), {
        page: Number(searchParams.get("page") ?? 1),
        pageSize: Number(searchParams.get("pageSize") ?? 0) || undefined,
        filter: searchParams.get("filter") ?? "all",
        q: searchParams.get("q") ?? "",
      })
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as MarkBody;
    if (typeof body.found !== "boolean") {
      return NextResponse.json({ message: "found must be true or false" }, { status: 400 });
    }
    const detail = await markCountLine({ ...body, countId: Number(id) });
    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("locked") ? 409 : 500;
    return NextResponse.json({ message }, { status });
  }
}
