import { NextResponse } from "next/server";
import { exportCustodyRows } from "@/modules/financial-management/lgu-asset-management-system/custody/services/assetCustody";
import { buildCustodyWorkbook } from "@/modules/financial-management/lgu-asset-management-system/shared/assetWorkbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const { rows, offices } = await exportCustodyRows({
      q: searchParams.get("q") ?? undefined,
      officeId: searchParams.get("officeId") ? Number(searchParams.get("officeId")) : null,
      onlyWithOfficer: searchParams.get("onlyWithOfficer") === "1",
      form: searchParams.get("form"),
      officer: searchParams.get("officer"),
      prefix: searchParams.get("prefix"),
    });

    const buffer = await buildCustodyWorkbook({ rows, offices });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="custody-' +
          (searchParams.get("form") ?? "all") +
          "-" +
          new Date().toISOString().slice(0, 10) +
          '.xlsx"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
