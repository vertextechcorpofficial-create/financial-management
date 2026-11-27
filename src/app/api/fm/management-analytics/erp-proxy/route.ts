import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { COOKIE_NAME } from "@/lib/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ERP_BASE = "http://goatedcodoer:8076";

const ALLOWED_ENDPOINTS = new Set([
  "financial-summary",
  "org/units",
  "kpi-readings/breakdown",
  "kpi-targets",
  "org/positions",
  "kpi-readings/drivers",
  "kpi-readings/transactions",
  "reconciliation",
  "fx-rates",
  "sources/health",
  "financial/opex-breakdown",
  "financial/working-capital-aging",
  "kpi-readings/range",
  "calendar/holidays",
]);

const ALLOWED_QUERY_KEYS = new Set([
  "period",
  "from",
  "to",
  "kpiKey",
  "kpiKeys",
  "year",
  "country",
  "unitCode",
  "page",
  "size",
  "limit",
  "includeInputs",
  "base",
  "quote",
  "companyCode",
]);

async function resolveErpBaseUrl(): Promise<string> {
  const directusBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const directusToken = (process.env.DIRECTUS_STATIC_TOKEN || "").trim();
  if (directusBase) {
    try {
      const filter = encodeURIComponent(
        JSON.stringify({ company_code: { _eq: "MEN2" }, status: { _eq: "ACTIVE" } }),
      );
      const url = `${directusBase}/items/company_list?filter=${filter}&fields=company_code,springboot&limit=1`;
      const res = await fetch(url, {
        headers: directusToken ? { Authorization: `Bearer ${directusToken}` } : {},
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (res.ok) {
        const body = (await res.json()) as { data?: Array<{ springboot?: string | null }> };
        const springboot = body.data?.[0]?.springboot?.trim().replace(/\/+$/, "");
        if (springboot) return springboot;
      }
    } catch {
      // Fall back to configured Spring URL if company_list cannot be read right now.
    }
  }
  return (process.env.SPRING_API_BASE_URL || DEFAULT_ERP_BASE).trim().replace(/\/+$/, "");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const endpoint = (url.searchParams.get("endpoint") ?? "").trim().replace(/^\/+/, "");

  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return NextResponse.json(
      { success: false, error: `Unsupported ERP analytics endpoint "${endpoint}".` },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const bearerToken = cookieStore.get(COOKIE_NAME)?.value;
  if (!bearerToken) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED", error: "Sign in to load ERP analytics." },
      { status: 401 },
    );
  }

  const forwarded = new URLSearchParams();
  for (const [key, value] of url.searchParams.entries()) {
    if (key === "endpoint" || !ALLOWED_QUERY_KEYS.has(key)) continue;
    if (value !== "") forwarded.set(key, value);
  }

  const baseUrl = await resolveErpBaseUrl();
  const qs = forwarded.toString();
  const targetUrl = `${baseUrl}/api/management-analytics/${endpoint}${qs ? `?${qs}` : ""}`;

  try {
    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bearerToken}`,
      },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });

    // ERP returns 401 with an empty body when unauthenticated; never blindly parse JSON.
    if (upstream.status === 401) {
      return NextResponse.json(
        {
          success: false,
          code: "UNAUTHORIZED",
          error: "Your ERP_SERVER session has expired. Sign in again to load live analytics.",
        },
        { status: 401 },
      );
    }

    if (upstream.status === 404) {
      return NextResponse.json({
        success: true,
        available: false,
        sample: false,
        data: null,
      });
    }

    const body = (await upstream.json().catch(() => null)) as {
      success?: boolean;
      data?: Record<string, unknown> | null;
      error?: string;
      fieldErrors?: Record<string, string[]>;
    } | null;

    if (upstream.status === 403) {
      return NextResponse.json(
        {
          success: false,
          code: "FORBIDDEN",
          error: body?.error || "Access restricted for this analytics endpoint.",
        },
        { status: 403 },
      );
    }

    if (!upstream.ok || !body?.success) {
      return NextResponse.json(
        {
          success: false,
          error: body?.error || `ERP analytics request failed (${upstream.status}).`,
          ...(body?.fieldErrors ? { fieldErrors: body.fieldErrors } : {}),
        },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 500 },
      );
    }

    const data = body.data ?? null;
    const isSample = Boolean(data && typeof data === "object" && (data as { sample?: unknown }).sample === true);

    return NextResponse.json({
      success: true,
      available: true,
      sample: isSample,
      data,
    });
  } catch (error) {
    console.error(`[management-analytics/erp-proxy:${endpoint}]`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Could not reach ERP_SERVER right now.",
      },
      { status: 502 },
    );
  }
}
