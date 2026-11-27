import { NextResponse } from "next/server";
import { listReferenceData, saveReference } from "@/modules/financial-management/barangay-asset-inventory-system/admin/services/brgyAdmin";
import type { ReferenceKind } from "@/modules/financial-management/barangay-asset-inventory-system/admin/services/brgyAdmin";

import { AccessError, requirePermission, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(err: unknown, status = 400) {
  if (err instanceof AccessError) return NextResponse.json({ message: err.message }, { status: err.status });
  return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status });
}

export async function GET() {
  try {
    const access = await resolveAccess();
    requirePermission(access, "users", "manage the lists");
    return NextResponse.json(await listReferenceData());
  } catch (err) {
    return fail(err, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const access = await resolveAccess();
    requirePermission(access, "users", "manage the lists");
    const row = await saveReference({
      kind: String(body?.kind ?? "") as ReferenceKind,
      id: body?.id,
      name: body?.name,
      code: body?.code,
      district: body?.district,
      contactPerson: body?.contactPerson,
      position: body?.position,
      barangayId: body?.barangayId,
      classificationId: body?.classificationId,
      lifeSpanYears: body?.lifeSpanYears,
      sort: body?.sort,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
