import { NextResponse } from "next/server";
import {
  exportCountReportPdf,
  exportCountReportXlsx,
} from "@/modules/financial-management/lgu-asset-management-system/physical-count/services/countExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const form = searchParams.get("form") === "rpcsp" ? "rpcsp" : "rpcppe";
    const format = searchParams.get("format") === "pdf" ? "pdf" : "xlsx";

    const result = format === "pdf"
      ? await exportCountReportPdf(Number(id), form)
      : await exportCountReportXlsx(Number(id), form);

    const contentType = format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": 'attachment; filename="' + result.filename + '"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
