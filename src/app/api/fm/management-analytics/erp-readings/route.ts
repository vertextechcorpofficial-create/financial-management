import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { COOKIE_NAME } from "@/lib/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DEFAULT_ERP_BASE = "http://goatedcodoer:8076";

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
  const period = (url.searchParams.get("period") ?? "").trim();

  if (!PERIOD_RE.test(period)) {
    return NextResponse.json(
      {
        success: false,
        error: "Some fields need attention.",
        fieldErrors: { period: ["Use a month like 2026-11."] },
      },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const bearerToken = cookieStore.get(COOKIE_NAME)?.value;
  if (!bearerToken) {
    return NextResponse.json(
      { success: false, error: "Sign in to load live ERP KPI readings." },
      { status: 401 },
    );
  }

  const baseUrl = await resolveErpBaseUrl();
  const targetUrl = `${baseUrl}/api/management-analytics/kpi-readings?period=${encodeURIComponent(period)}`;

  try {
    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bearerToken}`,
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (upstream.status === 401 || upstream.status === 403) {
      return NextResponse.json(
        {
          success: false,
          error:
            upstream.status === 401
              ? "Your ERP_SERVER session has expired. Sign in again to read live inputs."
              : "ERP_SERVER refused this session for management analytics KPI readings.",
        },
        { status: upstream.status },
      );
    }

    const body = (await upstream.json().catch(() => null)) as {
      success?: boolean;
      data?: unknown;
      error?: string;
      fieldErrors?: Record<string, string[]>;
    } | null;

    if (!upstream.ok || !body?.success) {
      return NextResponse.json(
        {
          success: false,
          error: body?.error || `The ERP KPI readings could not be worked out (${upstream.status}).`,
          ...(body?.fieldErrors ? { fieldErrors: body.fieldErrors } : {}),
        },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 500 },
      );
    }

    return NextResponse.json({ success: true, data: body.data });
  } catch (error) {
    console.error("[management-analytics/erp-readings]", error);
    return NextResponse.json(
      {
        success: false,
        error: "Could not reach ERP_SERVER for live KPI inputs right now.",
      },
      { status: 502 },
    );
  }
}
