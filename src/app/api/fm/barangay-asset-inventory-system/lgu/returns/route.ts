import { NextResponse } from "next/server";
import { AccessError, requireLguStaff, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";
import { enc, get } from "@/modules/financial-management/barangay-asset-inventory-system/shared/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Section 4.10: the LGU inbox of assets a barangay wants to send back. */
export async function GET() {
  try {
    const access = await resolveAccess();
    requireLguStaff(access, "read incoming returns");
    const rows = await get<Record<string, unknown>[]>(
      "/items/brgy_transfer?filter=" +
        enc({ _and: [{ direction: { _eq: "barangay_to_lgu" } }, { status: { _eq: "for_return" } }] }) +
        "&sort=-id&limit=-1&fields=id,asset_id,direction,from_barangay_id,to_barangay_id,status,remark,defect,requested_by,decided_by,decision_remark,lgu_asset_id,source_system"
    );
    const ids = [...new Set((rows ?? []).map((r) => Number(r.asset_id)))];
    const assets = ids.length
      ? await get<Record<string, unknown>[]>("/items/brgy_asset?filter=" + enc({ id: { _in: ids } }) + "&fields=id,asset_code,name,status,condition,barangay_id&limit=-1")
      : [];
    return NextResponse.json({ returns: rows ?? [], assets });
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ message: err.message }, { status: err.status });
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
