import { NextResponse } from "next/server";
import { createBulkAssets } from "@/modules/financial-management/lgu-asset-management-system/registry/services/assetRegistry";
import type { BulkAssetInput } from "@/modules/financial-management/lgu-asset-management-system/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as BulkAssetInput;
    const result = await createBulkAssets(body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
