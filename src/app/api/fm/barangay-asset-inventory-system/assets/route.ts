import { NextResponse } from "next/server";
import { createAsset, fetchLookups, listAssets } from "@/modules/financial-management/barangay-asset-inventory-system/assets/services/brgyAssets";
import type { BrgyCondition } from "@/modules/financial-management/barangay-asset-inventory-system/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(err: unknown, status = 400) {
  return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const barangayId = Number(searchParams.get("barangayId"));
    if (!barangayId) return NextResponse.json({ message: "barangayId is required" }, { status: 400 });
    const [result, lookups] = await Promise.all([
      listAssets({
        barangayId,
        q: searchParams.get("q") ?? undefined,
        status: searchParams.get("status") ?? undefined,
        condition: searchParams.get("condition") ?? undefined,
        includeDrafts: searchParams.get("drafts") === "1",
        page: Number(searchParams.get("page") ?? 1),
        pageSize: Number(searchParams.get("pageSize") ?? 20),
      }),
      fetchLookups(barangayId),
    ]);
    return NextResponse.json({ ...result, lookups });
  } catch (err) {
    return fail(err, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.barangayId) return NextResponse.json({ message: "barangayId is required" }, { status: 400 });
    const asset = await createAsset({
      barangayId: Number(body.barangayId),
      name: String(body.name ?? ""),
      classificationId: body.classificationId ? Number(body.classificationId) : null,
      barcode: body.barcode ?? null,
      tagNo: body.tagNo ?? null,
      securityTag: body.securityTag ?? null,
      serialNo: body.serialNo ?? null,
      officeId: body.officeId ? Number(body.officeId) : null,
      custodianId: body.custodianId ? Number(body.custodianId) : null,
      dateAcquired: String(body.dateAcquired ?? ""),
      cost: Number(body.cost ?? 0),
      quantity: Number(body.quantity ?? 1),
      lifeSpanYears: Number(body.lifeSpanYears ?? 0),
      condition: (body.condition ?? "Good") as BrgyCondition,
      remarks: body.remarks ?? null,
      isDraft: Boolean(body.isDraft),
      createdBy: body.createdBy ?? null,
      photo: body.photo ?? null,
    });
    return NextResponse.json(asset, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
