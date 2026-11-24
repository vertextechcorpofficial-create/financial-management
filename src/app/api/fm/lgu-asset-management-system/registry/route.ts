import { NextResponse } from "next/server";
import {
  createAsset,
  fetchLookups,
  listAssets,
  retireAsset,
  updateAsset,
} from "@/modules/financial-management/lgu-asset-management-system/registry/services/assetRegistry";
import type {
  AssetRecordStatus,
  LguAssetInput,
} from "@/modules/financial-management/lgu-asset-management-system/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ message }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? undefined;
    const classId = searchParams.get("classId");
    const officeId = searchParams.get("officeId");
    const recordStatus = searchParams.get("recordStatus");
    const page = Number(searchParams.get("page") ?? 1);
    const pageSize = Number(searchParams.get("pageSize") ?? 10);

    const [list, lookups] = await Promise.all([
      listAssets({
        q,
        classId: classId ? Number(classId) : null,
        officeId: officeId ? Number(officeId) : null,
        recordStatus: (recordStatus as AssetRecordStatus | null) ?? null,
        page,
        pageSize,
      }),
      fetchLookups(),
    ]);

    return NextResponse.json({
      assets: list.assets,
      total: list.total,
      page,
      pageSize,
      lookups,
    });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as LguAssetInput;
    if (!body.description || !body.class_id || !body.acquisition_date) {
      return NextResponse.json(
        { message: "description, class_id and acquisition_date are required" },
        { status: 400 }
      );
    }
    const asset = await createAsset(body);
    return NextResponse.json(asset, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as Partial<LguAssetInput> & { id?: number };
    if (!body.id) {
      return NextResponse.json({ message: "id is required" }, { status: 400 });
    }
    const { id, ...patch } = body;
    const asset = await updateAsset(Number(id), patch);
    return NextResponse.json(asset);
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ message: "id is required" }, { status: 400 });
    }
    const asset = await retireAsset(id);
    return NextResponse.json(asset);
  } catch (err) {
    return fail(err);
  }
}
