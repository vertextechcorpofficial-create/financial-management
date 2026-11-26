import { NextResponse } from "next/server";
import {
  createIncomingTransfer,
  decideTransfer,
  listTransfers,
} from "@/modules/financial-management/barangay-asset-inventory-system/transfers/services/brgyTransfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const barangayId = Number(searchParams.get("barangayId"));
    if (!barangayId) return NextResponse.json({ message: "barangayId is required" }, { status: 400 });
    return NextResponse.json(await listTransfers(barangayId));
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body?.action === "send") {
      return NextResponse.json(
        await createIncomingTransfer({
          assetId: Number(body.assetId),
          toBarangayId: Number(body.toBarangayId),
          remark: body.remark ?? null,
          actor: body.actor ?? null,
        }),
        { status: 201 }
      );
    }
    const decision = body?.decision;
    if (!["receive", "reject", "confirm_return", "decline_return"].includes(decision)) {
      return NextResponse.json({ message: "Unknown decision" }, { status: 400 });
    }
    return NextResponse.json(
      await decideTransfer({ transferId: Number(body.transferId), decision, remark: body.remark ?? null, actor: body.actor ?? null })
    );
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
