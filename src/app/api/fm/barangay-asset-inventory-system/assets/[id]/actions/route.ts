import { NextResponse } from "next/server";
import {
  assignCustodian,
  cancelAsset,
  changeStatus,
  updateCondition,
} from "@/modules/financial-management/barangay-asset-inventory-system/assets/services/brgyAssets";
import { requestReturn } from "@/modules/financial-management/barangay-asset-inventory-system/transfers/services/brgyTransfers";
import type { BrgyCondition, BrgyStatus } from "@/modules/financial-management/barangay-asset-inventory-system/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const assetId = Number(id);
    const body = await req.json();

    switch (body?.action) {
      case "assign": {
        const detail = await assignCustodian({
          assetId,
          custodianId: Number(body.custodianId),
          officeId: body.officeId ? Number(body.officeId) : null,
          remarks: body.remarks ?? null,
          actor: body.actor ?? null,
        });
        return NextResponse.json(detail);
      }
      case "condition": {
        const detail = await updateCondition({
          assetId,
          condition: body.condition as BrgyCondition,
          remarks: String(body.remarks ?? ""),
          actor: body.actor ?? null,
        });
        return NextResponse.json(detail);
      }
      case "status": {
        const detail = await changeStatus({
          assetId,
          to: body.to as BrgyStatus,
          reason: body.reason ?? null,
          repairNote: body.repairNote ?? null,
          condition: (body.condition ?? null) as BrgyCondition | null,
          actor: body.actor ?? null,
        });
        return NextResponse.json(detail);
      }
      case "cancel": {
        await cancelAsset({ assetId, reason: String(body.reason ?? ""), actor: body.actor ?? null });
        return NextResponse.json({ ok: true });
      }
      case "return": {
        return NextResponse.json(await requestReturn({ assetId, defect: String(body.defect ?? ""), actor: body.actor ?? null }), { status: 201 });
      }
      default:
        return NextResponse.json({ message: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
