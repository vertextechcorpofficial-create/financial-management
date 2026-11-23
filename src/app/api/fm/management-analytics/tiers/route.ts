import { NextResponse } from "next/server";

import { handleRouteError, ok } from "../_lib/http";
import { loadCatalog } from "@/modules/financial-management/management-analytics/analytics-tiers/services/catalog.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const payload = await loadCatalog({
      tier: url.searchParams.get("tier") ?? "ALL",
      company: url.searchParams.get("company") ?? "ALL",
      domain: url.searchParams.get("domain") ?? "ALL",
      q: url.searchParams.get("q") ?? "",
      page: Number(url.searchParams.get("page") ?? "1"),
      size: Number(url.searchParams.get("size") ?? "20"),
    });
    return ok(payload);
  } catch (error) {
    return handleRouteError(error, "tiers", "The KPI catalogue could not be read.");
  }
}

export function POST() {
  return NextResponse.json({ success: false, error: "The KPI catalogue is read-only." }, { status: 405 });
}
