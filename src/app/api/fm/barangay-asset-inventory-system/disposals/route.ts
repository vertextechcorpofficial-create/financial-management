import { NextResponse } from "next/server";
import { listDisposals, requestDisposal } from "@/modules/financial-management/barangay-asset-inventory-system/disposal/services/brgyDisposal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const barangayId = Number(searchParams.get("barangayId"));
    if (!barangayId) return NextResponse.json({ message: "barangayId is required" }, { status: 400 });
    return NextResponse.json({ rows: await listDisposals(barangayId) });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return NextResponse.json(
      await requestDisposal({ assetId: Number(body.assetId), reason: String(body.reason ?? ""), actor: body.actor ?? null }),
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
