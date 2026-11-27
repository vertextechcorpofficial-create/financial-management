import { NextResponse } from "next/server";
import { fetchLookups, updateSettings } from "@/modules/financial-management/barangay-asset-inventory-system/assets/services/brgyAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const lookups = await fetchLookups();
    return NextResponse.json({ settings: lookups.settings, barangays: lookups.barangays });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return NextResponse.json(
      await updateSettings({
        salvagePercent: Number(body.salvagePercent ?? 0),
        approvalRequired: Boolean(body.approvalRequired),
        lifeEquipment: body.lifeEquipment ? Number(body.lifeEquipment) : null,
        lifeMachinery: body.lifeMachinery ? Number(body.lifeMachinery) : null,
        lifeFurniture: body.lifeFurniture ? Number(body.lifeFurniture) : null,
        lifeOther: body.lifeOther ? Number(body.lifeOther) : null,
      })
    );
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
