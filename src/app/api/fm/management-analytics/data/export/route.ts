import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { handleRouteError } from "../../_lib/http";
import { loadData } from "@/modules/financial-management/management-analytics/analytics-data/services/data.service";
import { asNumber, asString, listItems } from "@/modules/financial-management/management-analytics/analytics-data/services/directus";
import { phtToday } from "@/modules/financial-management/management-analytics/analytics-data/pht";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The pack a controller takes to audit: one row per measure for the month. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? "";
    const payload = await loadData(period || undefined);

    const [kpiRows, actuals, targets] = await Promise.all([
      listItems<Record<string, unknown>>("ma_kpi", {
        fields: ["id", "kpi_key", "name", "company_id", "tier", "domain", "unit", "dp", "rule_type", "threshold", "polarity"],
        filter: { is_active: { _eq: true } },
        sort: ["tier", "company_id", "sort"],
        limit: 400,
      }),
      listItems<Record<string, unknown>>("ma_kpi_actual", {
        fields: ["kpi_id", "period", "value", "basis"],
        filter: { period: { _eq: payload.period } },
        limit: 5000,
      }),
      listItems<Record<string, unknown>>("ma_kpi_target", {
        fields: ["kpi_id", "period", "target"],
        filter: { period: { _eq: payload.period } },
        limit: 5000,
      }),
    ]);

    const companyOf = new Map(payload.companies.map((company) => [company.id, company]));
    const actualOf = new Map(actuals.rows.map((row) => [asNumber(row.kpi_id), row]));
    const targetOf = new Map(targets.rows.map((row) => [asNumber(row.kpi_id), row]));

    const header = [
      "Measure",
      "Key",
      "Company",
      "Tier",
      "Domain",
      "Unit",
      "Reading",
      "Basis",
      "Target",
      "Difference",
      "Rule",
      "Source",
    ];
    const rows: Array<Array<string | number | null>> = [header];

    for (const kpi of kpiRows.rows) {
      const id = asNumber(kpi.id);
      const actual = actualOf.get(id);
      const target = targetOf.get(id);
      const value = actual ? asNumber(actual.value) : null;
      const limit = target ? asNumber(target.target) : null;
      const dp = asNumber(kpi.dp, 1);
      const company = companyOf.get(asNumber(kpi.company_id));
      rows.push([
        asString(kpi.name),
        asString(kpi.kpi_key),
        company ? `${company.code.toUpperCase()} ${company.name}` : "—",
        asString(kpi.tier),
        asString(kpi.domain),
        kpi.unit === null ? "" : asString(kpi.unit),
        value === null ? null : Number(value.toFixed(dp)),
        actual ? asString(actual.basis) : "NO READING",
        limit === null ? null : Number(limit.toFixed(dp)),
        value === null || limit === null ? null : Number((value - limit).toFixed(dp + 2)),
        asString(kpi.rule_type) === "PCT" ? `±${asString(kpi.threshold)}% of target` : `${asString(kpi.rule_type)} ${asString(kpi.threshold)}`,
        "MANUAL / ERP",
      ]);
    }

    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = header.map((_, index) => ({ wch: index === 0 ? 34 : index === 2 ? 30 : 14 }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, payload.period);
    const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
    // Two bare dates side by side read as one long date; say which is which.
    const filename = `management-analytics-${payload.period}-as-at-${phtToday()}.xlsx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error, "data/export", "The pack could not be written.");
  }
}
