import { NextResponse } from "next/server";
import { AccessError, requireLguStaff, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";
import { LguFeedError, listAssignableLguAssets } from "@/modules/financial-management/barangay-asset-inventory-system/server/lguFeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Section 4.9: LGU staff pick the asset to send. Barangay roles never see this list. */
export async function GET(req: Request) {
  try {
    const access = await resolveAccess();
    requireLguStaff(access, "read the LGU register");
    const { searchParams } = new URL(req.url);
    const assets = await listAssignableLguAssets(searchParams.get("q") ?? "");
    return NextResponse.json({ assets });
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ message: err.message }, { status: err.status });
    if (err instanceof LguFeedError) return NextResponse.json({ message: err.message }, { status: err.status });
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
