import { NextResponse } from "next/server";
import { AccessError, requireLguStaff, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";
import { LguFeedError, listAssignableLguAssets, markLguTransferred } from "@/modules/financial-management/barangay-asset-inventory-system/server/lguFeed";
import { assignLguAsset } from "@/modules/financial-management/barangay-asset-inventory-system/transfers/services/brgyTransfers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Section 4.9: send one LGU asset to a barangay, which then receives or rejects it. */
export async function POST(req: Request) {
  try {
    const access = await resolveAccess();
    requireLguStaff(access, "send an asset to a barangay");
    const body = await req.json();
    const lguAssetId = Number(body.lguAssetId);
    const toBarangayId = Number(body.toBarangayId);
    if (!lguAssetId || !toBarangayId) return NextResponse.json({ message: "Choose an asset and a barangay" }, { status: 400 });

    const assets = await listAssignableLguAssets();
    const asset = assets.find((a) => a.id === lguAssetId);
    if (!asset) return NextResponse.json({ message: "That LGU asset is no longer available for assignment." }, { status: 400 });

    const transfer = await assignLguAsset({
      lguAssetId,
      toBarangayId,
      remark: body.remark ?? null,
      actor: access.userId ?? null,
      snapshot: asset.snapshot,
      name: asset.description,
      dateAcquired: asset.acquisitionDate,
      cost: asset.cost,
    });

    const handedOff = await markLguTransferred(lguAssetId);
    return NextResponse.json({ transfer, lguRecordUpdated: handedOff }, { status: 201 });
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ message: err.message }, { status: err.status });
    if (err instanceof LguFeedError) return NextResponse.json({ message: err.message }, { status: err.status });
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
