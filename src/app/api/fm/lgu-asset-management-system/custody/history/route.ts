import { NextResponse } from "next/server";
import { fetchHistory } from "@/modules/financial-management/lgu-asset-management-system/custody/services/assetCustody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const assetId = Number(searchParams.get("assetId"));
    if (!assetId) {
      return NextResponse.json({ message: "assetId is required" }, { status: 400 });
    }
    return NextResponse.json(await fetchHistory(assetId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
