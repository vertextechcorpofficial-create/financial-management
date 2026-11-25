import { NextResponse } from "next/server";
import { buildReports } from "@/modules/financial-management/lgu-asset-management-system/reports/services/assetReports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    return NextResponse.json(await buildReports(searchParams.get("asOf") ?? undefined));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
