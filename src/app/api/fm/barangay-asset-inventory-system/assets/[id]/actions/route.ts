import { NextResponse } from "next/server";
import {
  assignCustodian,
  cancelAsset,
  changeStatus,
  fetchAsset,
  updateAsset,
  updateCondition,
} from "@/modules/financial-management/barangay-asset-inventory-system/assets/services/brgyAssets";
import { requestReturn } from "@/modules/financial-management/barangay-asset-inventory-system/transfers/services/brgyTransfers";
import type { BrgyCondition, BrgyStatus } from "@/modules/financial-management/barangay-asset-inventory-system/types";

import { requireBarangayScope, requirePermission, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const assetId = Number(id);
    const body = await req.json();
    const access = await resolveAccess();
    const detail = await fetchAsset(assetId);
    const isCancel = body?.action === "cancel";
    const isEdit = isCancel || body?.action === "update";
    requireBarangayScope(access, detail.asset.barangay_id, isCancel ? "cancelRecord" : isEdit ? "editRecord" : "assign");

    // recording an asset, correcting one and erasing one from the working list are three rights
    if (isCancel) requirePermission(access, "cancelRecord", "cancel a record");
    else if (isEdit) requirePermission(access, "editRecord", "edit a record");
    else requirePermission(access, "assign", "change an assignment, condition or status");

    switch (body?.action) {
      case "assign": {
        const detail = await assignCustodian({
          assetId,
          custodianId: Number(body.custodianId),
          officeId: body.officeId ? Number(body.officeId) : null,
          remarks: body.remarks ?? null,
          actor: access.userId ?? body.actor ?? null,
        });
        return NextResponse.json(detail);
      }
      case "condition": {
        const detail = await updateCondition({
          assetId,
          condition: body.condition as BrgyCondition,
          remarks: String(body.remarks ?? ""),
          actor: access.userId ?? body.actor ?? null,
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
          actor: access.userId ?? body.actor ?? null,
        });
        return NextResponse.json(detail);
      }
      case "update": {
        const detail = await updateAsset({
          assetId,
          name: body.name,
          classificationId: body.classificationId === undefined ? undefined : body.classificationId ? Number(body.classificationId) : null,
          itemTypeId: body.itemTypeId === undefined ? undefined : body.itemTypeId ? Number(body.itemTypeId) : null,
          barcode: body.barcode,
          tagNo: body.tagNo,
          securityTag: body.securityTag,
          serialNo: body.serialNo,
          officeId: body.officeId === undefined ? undefined : body.officeId ? Number(body.officeId) : null,
          dateAcquired: body.dateAcquired,
          cost: body.cost === undefined ? undefined : Number(body.cost),
          quantity: body.quantity === undefined ? undefined : Number(body.quantity),
          lifeSpanYears: body.lifeSpanYears === undefined ? undefined : Number(body.lifeSpanYears),
          condition: body.condition,
          remarks: body.remarks,
          isDraft: body.isDraft,
          actor: access.userId ?? body.actor ?? null,
        });
        return NextResponse.json(detail);
      }
      case "cancel": {
        await cancelAsset({ assetId, reason: String(body.reason ?? ""), actor: access.userId ?? body.actor ?? null });
        return NextResponse.json({ ok: true });
      }
      case "return": {
        return NextResponse.json(await requestReturn({ assetId, defect: String(body.defect ?? ""), actor: access.userId ?? body.actor ?? null }), { status: 201 });
      }
      default:
        return NextResponse.json({ message: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
