import { NextResponse } from "next/server";
import {
  getAsset,
  retireAsset,
  updateAsset,
} from "@/modules/financial-management/lgu-asset-management-system/registry/services/assetRegistry";
import type { LguAssetInput } from "@/modules/financial-management/lgu-asset-management-system/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ message }, { status });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const asset = await getAsset(Number(id));
    if (!asset) return NextResponse.json({ message: "Not found" }, { status: 404 });
    return NextResponse.json(asset);
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const patch = (await req.json()) as Partial<LguAssetInput>;
    const asset = await updateAsset(Number(id), patch);
    return NextResponse.json(asset);
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const asset = await retireAsset(Number(id));
    return NextResponse.json(asset);
  } catch (err) {
    return fail(err);
  }
}
