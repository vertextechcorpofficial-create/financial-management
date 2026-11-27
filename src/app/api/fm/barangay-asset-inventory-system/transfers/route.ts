import { NextResponse } from "next/server";
import {
  cancelTransfer,
  createIncomingTransfer,
  decideTransfer,
  listTransfers,
} from "@/modules/financial-management/barangay-asset-inventory-system/transfers/services/brgyTransfers";


import { requireBarangayScope, requireLguStaff, requirePermission, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";

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
      // section 4.9: only LGU staff can send an asset to a barangay
      requireLguStaff(access, "send an asset to a barangay");
      return NextResponse.json(
        await createIncomingTransfer({
          assetId: Number(body.assetId),
          toBarangayId: Number(body.toBarangayId),
          remark: body.remark ?? null,
          actor: access.userId ?? body.actor ?? null,
        }),
        { status: 201 }
      );
    }
    if (body?.action === "cancel") {
      // section 4.9: the LGU can still cancel the transfer before the barangay receives it
      requireLguStaff(access, "cancel a transfer");
      return NextResponse.json(
        await cancelTransfer({ transferId: Number(body.transferId), actor: access.userId ?? body.actor ?? null, remark: body.remark ?? null })
      );
    }
    const decision = body?.decision;
    if (!["receive", "reject", "confirm_return", "decline_return"].includes(decision)) {
      return NextResponse.json({ message: "Unknown decision" }, { status: 400 });
    }
    if (decision === "confirm_return" || decision === "decline_return") {
      // section 4.10: LGU staff confirm or decline a return
      requireLguStaff(access, "confirm or decline a return");
    } else {
      // section 4.10: the Barangay Admin or Property Custodian receive or reject what the LGU sent
      requirePermission(access, "assign", "receive or reject a transfer");
    }
    return NextResponse.json(
      await decideTransfer({
        transferId: Number(body.transferId),
        decision,
        remark: body.remark ?? null,
        actor: access.userId ?? body.actor ?? null,
        condition: body.condition ?? null,
      })
    );
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
