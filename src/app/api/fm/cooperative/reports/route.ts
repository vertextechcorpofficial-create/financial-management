import { serializeMemberReport } from "@/modules/financial-management/cooperative/console/reports/report-export";
import { MemberError } from "@/modules/financial-management/cooperative/server/member-errors";
import { getMemberReport, reportFilename, reportPage } from "@/modules/financial-management/cooperative/server/member-reports";
import { withMembers } from "../members/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withMembers(async () => {
    const params = new URL(request.url).searchParams;
    const format = params.get("format");
    const fingerprint = params.get("fingerprint") ?? "";
    if (format !== null && format !== "csv" && format !== "tsv") throw new MemberError(400, "Choose CSV or spreadsheet copy.");
    if (format && !/^[a-f0-9]{64}$/.test(fingerprint)) throw new MemberError(400, "Load the report before exporting.");

    const report = await getMemberReport(params);
    if (!format) return Response.json(reportPage(report));
    if (report.fingerprint !== fingerprint) {
      throw new MemberError(409, "The report data changed. Refresh the report before exporting.", "REPORT_CHANGED");
    }
    if (report.blocked) {
      throw new MemberError(503, report.notices?.[0]?.message ?? "This report is temporarily unavailable.");
    }
    const text = serializeMemberReport(report, format);
    return format === "csv" ? new Response("\ufeff" + text, { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="' + reportFilename(report) + '"',
    } }) : new Response(text, { headers: { "Content-Type": "text/tab-separated-values; charset=utf-8" } });
  }, "reports");
}
