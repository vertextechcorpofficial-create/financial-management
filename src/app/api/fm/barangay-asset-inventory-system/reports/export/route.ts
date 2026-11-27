import { NextResponse } from "next/server";
import {
  accountability,
  consolidation,
  countSummary,
  masterlist,
} from "@/modules/financial-management/barangay-asset-inventory-system/reports/services/brgyReports";
import {
  buildAccountabilityWorkbook,
  buildConsolidationWorkbook,
  buildCountSummaryWorkbook,
  buildMasterlistWorkbook,
} from "@/modules/financial-management/barangay-asset-inventory-system/reports/services/brgyReportWorkbook";
import { fetchLookups } from "@/modules/financial-management/barangay-asset-inventory-system/assets/services/brgyAssets";
import { AccessError, requireBarangayScope, requirePermission, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function file(buffer: Buffer, name: string) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="' + name + '"',
    },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind") ?? "masterlist";
    const access = await resolveAccess();
    requirePermission(access, "reports", "export a report");
    if (kind === "consolidation" && access.role !== "municipal" && access.role !== "system_admin") {
      throw new AccessError("Municipal consolidation is for the Municipal Property and Accounting Offices.", 403);
    }
    const barangayId = kind === "consolidation" ? 0 : requireBarangayScope(access, Number(searchParams.get("barangayId")), "view");
    const lookups = await fetchLookups(barangayId || undefined);
    const barangay = lookups.barangays.find((b) => b.id === barangayId);
    const label = (barangay ? barangay.code + "-" + barangay.name.replace(/[^a-zA-Z0-9]+/g, "-") : "barangay").toLowerCase();
    const stamp = new Date().toISOString().slice(0, 10);

    if (kind === "consolidation") {
      const data = await consolidation();
      return file(await buildConsolidationWorkbook(data), "municipal-consolidation-" + stamp + ".xlsx");
    }

    if (!barangayId) return NextResponse.json({ message: "barangayId is required" }, { status: 400 });

    if (kind === "accountability") {
      const data = await accountability(barangayId);
      return file(
        await buildAccountabilityWorkbook({ barangay: barangay?.name ?? String(barangayId), asOf: data.asOf, groups: data.groups }),
        "accountability-" + label + "-" + stamp + ".xlsx"
      );
    }

    if (kind === "count") {
      const countId = Number(searchParams.get("countId"));
      if (!countId) return NextResponse.json({ message: "countId is required" }, { status: 400 });
      const data = await countSummary(countId);
      return file(
        await buildCountSummaryWorkbook({
          barangay: barangay?.name ?? String(barangayId),
          year: data.year,
          status: data.status,
          found: data.found,
          notFound: data.notFound,
          notYetRecorded: data.notYetRecorded,
          conditionChanges: data.conditionChanges,
        }),
        "count-summary-" + data.year + "-" + label + ".xlsx"
      );
    }

    const data = await masterlist(barangayId);
    return file(
      await buildMasterlistWorkbook({ barangay: barangay?.name ?? String(barangayId), asOf: data.asOf, rows: data.rows, totalValue: data.totalValue }),
      "masterlist-" + label + "-" + stamp + ".xlsx"
    );
  } catch (err) {
    if (err instanceof AccessError) return NextResponse.json({ message: err.message }, { status: err.status });
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
