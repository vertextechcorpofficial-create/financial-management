import { NextResponse } from "next/server";
import {
  fetchCountLines,
  fetchCountSession,
  lockCountSession,
  reopenCountSession,
  submitCountSession,
} from "@/modules/financial-management/lgu-asset-management-system/physical-count/services/assetCount";
import type { CountLinesResponse } from "@/modules/financial-management/lgu-asset-management-system/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LineFilter = "all" | "uncounted" | "found" | "notfound" | "pending" | "station";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const filter = (searchParams.get("filter") as LineFilter | null) ?? "all";
    if (filter === "all") return NextResponse.json(await fetchCountSession(Number(id)));
    const data: CountLinesResponse = await fetchCountLines(Number(id), filter);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}

interface ActionBody {
  action: "lock" | "reopen" | "submit";
  reason?: string;
  submittedTo?: string;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as ActionBody;
    const countId = Number(id);

    if (body.action === "lock") return NextResponse.json(await lockCountSession(countId));
    if (body.action === "reopen") return NextResponse.json(await reopenCountSession(countId, body.reason ?? ""));
    if (body.action === "submit") return NextResponse.json(await submitCountSession(countId, body.submittedTo ?? ""));

    return NextResponse.json({ message: "action must be lock, reopen or submit" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 409 });
  }
}
