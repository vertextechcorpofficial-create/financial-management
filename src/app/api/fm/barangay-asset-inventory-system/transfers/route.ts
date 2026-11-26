import { NextResponse } from "next/server";
import {
  cancelTransfer,
  createIncomingTransfer,
  decideTransfer,
  listTransfers,
} from "@/modules/financial-management/barangay-asset-inventory-system/transfers/services/brgyTransfers";


import { requireBarangayScope, requirePermission, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const access = await resolveAccess();
    const barangayId = requireBarangayScope(access, Number(searchParams.get("barangayId")), "view");
    requirePermission(access, "view", "view transfers");
    return NextResponse.json(await listTransfers(barangayId));
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const access = await resolveAccess();
    if (body?.action === "send") {
      requirePermission(access, "assign", "send an asset to a barangay");
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
    if (body?.action === "cancel") {
      requirePermission(access, "assign", "cancel a transfer");
      return NextResponse.json(
        await cancelTransfer({ transferId: Number(body.transferId), actor: body.actor ?? null, remark: body.remark ?? null })
      );
    }
    const decision = body?.decision;
    requirePermission(access, "assign", "decide a transfer");
    if (!["receive", "reject", "confirm_return", "decline_return"].includes(decision)) {
      return NextResponse.json({ message: "Unknown decision" }, { status: 400 });
    }
    return NextResponse.json(
      await decideTransfer({
        transferId: Number(body.transferId),
        decision,
        remark: body.remark ?? null,
        actor: body.actor ?? null,
        condition: body.condition ?? null,
      })
    );
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
