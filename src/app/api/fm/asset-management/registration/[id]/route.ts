import { NextResponse } from "next/server";
import {
  fetchAssetById,
  fetchDepreciationPostings,
  fetchAssetTransfers,
  fetchAssetEvents,
  fetchAssetJournals,
  fetchAssetAuditLog,
  fetchAssetCostLines,
} from "@/modules/financial-management/asset-management/registration/services/assetDetailService";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const assetId = Number(id);

    if (!assetId) {
      return NextResponse.json({ error: "Invalid asset ID" }, { status: 400 });
    }

    const [
      asset,
      postings,
      transfers,
      events,
      journals,
      auditLogs,
      costLines,
    ] = await Promise.all([
      fetchAssetById(assetId),
      fetchDepreciationPostings(assetId),
      fetchAssetTransfers(assetId),
      fetchAssetEvents(assetId),
      fetchAssetJournals(assetId),
      fetchAssetAuditLog(assetId),
      fetchAssetCostLines(assetId),
    ]);

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json({
      asset,
      postings,
      transfers,
      events,
      journals,
      auditLogs,
      costLines,
    });
  } catch (error: unknown) {
    console.error("GET Asset Detail Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
