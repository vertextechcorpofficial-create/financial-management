import { NextResponse } from "next/server";
import { listDisposals, requestDisposal } from "@/modules/financial-management/barangay-asset-inventory-system/disposal/services/brgyDisposal";


import { requireBarangayScope, requirePermission, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const access = await resolveAccess();
    const barangayId = requireBarangayScope(access, Number(searchParams.get("barangayId")), "view");
    requirePermission(access, "view", "view disposals");
    return NextResponse.json({ rows: await listDisposals(barangayId) });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const access = await resolveAccess();
    requirePermission(access, "disposeRequest", "request a disposal");
    return NextResponse.json(
      await requestDisposal({ assetId: Number(body.assetId), reason: String(body.reason ?? ""), actor: access.userId ?? body.actor ?? null }),
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
