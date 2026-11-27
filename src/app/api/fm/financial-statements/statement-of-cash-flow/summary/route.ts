import { NextRequest, NextResponse } from "next/server";
import {
  resolveTargetRouting,
  fetchFromTargetSpring,
  ResolvedRouting,
} from "@/modules/financial-management/financial-statements/statement-of-cash-flows/services/company-proxy.server";
import {
  fetchActiveCompanyList,
  getCompanyServiceKeys,
  getUserCompanyCode,
} from "@/modules/financial-management/financial-statements/statement-of-cash-flows/services/company-directory.server";
import { CFSSummaryResponse, CFSSummaryActivity, CFSSummaryTrendPoint } from "@/modules/financial-management/financial-statements/statement-of-cash-flows/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startDate = request.nextUrl.searchParams.get("startDate")?.trim();
  const endDate = request.nextUrl.searchParams.get("endDate")?.trim();
  const groupBy = request.nextUrl.searchParams.get("groupBy")?.trim() || "month";
  const companyCode = request.nextUrl.searchParams.get("companyCode")?.trim();

  if (!startDate || !endDate) {
    return NextResponse.json(
      { message: "Both startDate and endDate are required.", success: false },
      { status: 400 },
    );
  }

  const query = new URLSearchParams({ startDate, endDate, groupBy }).toString();
  const endpointPath = `/api/view-fs-report-statement-cash-flow/summary?${query}`;

  // ─────────────────────────────────────────────────────────────
  // CASE 1: GROUP ("GRP") MULTI-COMPANY AGGREGATION
  // ─────────────────────────────────────────────────────────────
  if (companyCode?.toUpperCase() === "GRP") {
    const [companies, userCompanyCode] = await Promise.all([
      fetchActiveCompanyList(),
      getUserCompanyCode(),
    ]);

    const serviceKeys = getCompanyServiceKeys();
    const effectiveCompanies = companies.length > 0 ? companies : [
      { company_id: 1, company_code: "MEN2", company_name: "MEN2 (Dummy ERP)", springboot: "http://goatedcodoer:8076" },
      { company_id: 2, company_code: "VTC", company_name: "VTC Company" },
      { company_id: 3, company_code: "HC", company_name: "HC Company" },
      { company_id: 4, company_code: "RC2", company_name: "RC2 Company" },
      { company_id: 5, company_code: "C", company_name: "C Company" },
      { company_id: 6, company_code: "MFTG", company_name: "MFTG Company" },
      { company_id: 7, company_code: "RSM", company_name: "RSM Company" },
      { company_id: 8, company_code: "HR", company_name: "HR Company" },
      { company_id: 9, company_code: "ACE", company_name: "ACE Company" },
      { company_id: 10, company_code: "MENZA", company_name: "MENZA Company" },
    ];

    const includedCompanies: string[] = [];
    const missingCompanies: { code: string; name: string; reason: string }[] = [];

    // Eligible companies with keys or own company
    const eligibleRoutings: ResolvedRouting[] = [];

    for (const c of effectiveCompanies) {
      const code = c.company_code?.trim().toUpperCase();
      if (!code) continue;

      const isOwn = userCompanyCode && userCompanyCode.toUpperCase() === code;
      const key = serviceKeys[code];

      if (isOwn) {
        eligibleRoutings.push({
          type: "user_session",
          baseUrl: (c.springboot || process.env.SPRING_API_BASE_URL || "http://localhost:8080").replace(/\/+$/, ""),
          companyCode: code,
          companyName: c.company_name || code,
        });
      } else if (key) {
        eligibleRoutings.push({
          type: "service_token",
          baseUrl: (c.springboot || (code === "MEN2" ? "http://goatedcodoer:8076" : "")).replace(/\/+$/, ""),
          token: key,
          companyCode: code,
          companyName: c.company_name || code,
        });
      } else {
        missingCompanies.push({
          code,
          name: c.company_name || code,
          reason: "No service key configured",
        });
      }
    }

    // Call eligible companies in parallel with ~15s timeout
    const results = await Promise.allSettled(
      eligibleRoutings.map(async (routing) => {
        const resp = await fetchFromTargetSpring(routing, endpointPath, 15000);
        if (!resp.ok) {
          throw new Error(`Status ${resp.status}`);
        }
        const data: CFSSummaryResponse = await resp.json();
        return { routing, data };
      }),
    );

    let openingCash = 0;
    let netChange = 0;
    let closingCash = 0;

    const activityMap: Record<string, CFSSummaryActivity> = {
      OPERATING: { code: "OPERATING", label: "Operating Activities", inflow: 0, outflow: 0, net: 0, lines: [] },
      INVESTING: { code: "INVESTING", label: "Investing Activities", inflow: 0, outflow: 0, net: 0, lines: [] },
      FINANCING: { code: "FINANCING", label: "Financing Activities", inflow: 0, outflow: 0, net: 0, lines: [] },
      UNCLASSIFIED: { code: "UNCLASSIFIED", label: "Unclassified & Discrepancies", inflow: 0, outflow: 0, net: 0, lines: [] },
    };

    const trendMap: Record<string, CFSSummaryTrendPoint> = {};

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      const routing = eligibleRoutings[i];

      if (res.status === "fulfilled") {
        includedCompanies.push(routing.companyCode);
        const d = res.value.data;

        openingCash += d.openingCash || 0;
        netChange += d.netChange || 0;
        closingCash += d.closingCash || 0;

        // Merge activities
        for (const act of d.activities || []) {
          const target = activityMap[act.code];
          if (target) {
            target.inflow += act.inflow || 0;
            target.outflow += act.outflow || 0;
            target.net += act.net || 0;

            // Merge lines by glCode
            for (const line of act.lines || []) {
              const existingLine = target.lines.find((l) => l.glCode && line.glCode && l.glCode === line.glCode);
              if (existingLine) {
                existingLine.inflow += line.inflow || 0;
                existingLine.outflow += line.outflow || 0;
                existingLine.net += line.net || 0;
              } else {
                target.lines.push({
                  ...line,
                  accountTitle: `${line.accountTitle} (${routing.companyCode})`,
                });
              }
            }
          }
        }

        // Merge trends
        for (const pt of d.trend || []) {
          if (!trendMap[pt.period]) {
            trendMap[pt.period] = {
              period: pt.period,
              operating: 0,
              investing: 0,
              financing: 0,
              unclassified: 0,
              net: 0,
            };
          }
          trendMap[pt.period].operating += pt.operating || 0;
          trendMap[pt.period].investing += pt.investing || 0;
          trendMap[pt.period].financing += pt.financing || 0;
          trendMap[pt.period].unclassified += pt.unclassified || 0;
          trendMap[pt.period].net += pt.net || 0;
        }
      } else {
        missingCompanies.push({
          code: routing.companyCode,
          name: routing.companyName,
          reason: res.reason?.message || "Unreachable or timed out",
        });
      }
    }

    const sortedTrend = Object.values(trendMap).sort((a, b) => a.period.localeCompare(b.period));

    return NextResponse.json({
      success: true,
      reportLabel: "Combined (before eliminations)",
      period: { startDate, endDate },
      openingCash,
      netChange,
      closingCash,
      activities: [activityMap.OPERATING, activityMap.INVESTING, activityMap.FINANCING],
      unclassified: activityMap.UNCLASSIFIED,
      trend: sortedTrend,
      includedCompanies,
      missingCompanies,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // CASE 2: SINGLE COMPANY SELECTION
  // ─────────────────────────────────────────────────────────────
  const routing = await resolveTargetRouting(companyCode);
  if (routing instanceof NextResponse) {
    return routing; // 401 error response
  }

  const response = await fetchFromTargetSpring(routing, endpointPath);
  const data = await response.json();

  return NextResponse.json(
    {
      ...data,
      companyCode: routing.companyCode,
      companyName: routing.companyName,
    },
    { status: response.status },
  );
}
