import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth-utils";
import {
  fetchActiveCompanyList,
  getCompanyServiceKeys,
  getUserCompanyCode,
} from "./company-directory.server";

export interface ResolvedRouting {
  type: "user_session" | "service_token" | "missing_key";
  baseUrl: string;
  token?: string;
  companyCode: string;
  companyName: string;
}

export async function resolveTargetRouting(requestedCompany?: string | null): Promise<ResolvedRouting | NextResponse> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(COOKIE_NAME)?.value;
  if (!sessionToken) {
    return NextResponse.json({ message: "Authentication required", success: false }, { status: 401 });
  }

  const [companies, userCompanyCode] = await Promise.all([
    fetchActiveCompanyList(),
    getUserCompanyCode(),
  ]);

  const targetCode = requestedCompany?.trim().toUpperCase() || userCompanyCode?.toUpperCase() || "MEN2";
  const serviceKeys = getCompanyServiceKeys();

  // Find company record
  const companyRecord = companies.find((c) => c.company_code?.trim().toUpperCase() === targetCode);
  const companyName = companyRecord?.company_name || targetCode;

  // 1. Is this the user's own home company?
  const isOwnCompany = userCompanyCode && userCompanyCode.toUpperCase() === targetCode;
  if (isOwnCompany) {
    const baseUrl = (companyRecord?.springboot || process.env.SPRING_API_BASE_URL || "http://localhost:8080").replace(/\/+$/, "");
    return {
      type: "user_session",
      baseUrl,
      companyCode: targetCode,
      companyName,
    };
  }

  // 2. Other company: requires service key
  const serviceKey = serviceKeys[targetCode];
  if (!serviceKey) {
    return {
      type: "missing_key",
      baseUrl: "",
      companyCode: targetCode,
      companyName,
    };
  }

  // Address from company_list.springboot (fallback to default dummy MEN2 port if not populated)
  let baseUrl = (companyRecord?.springboot || "").trim().replace(/\/+$/, "");
  if (!baseUrl && targetCode === "MEN2") {
    baseUrl = "http://goatedcodoer:8076";
  }

  return {
    type: "service_token",
    baseUrl: baseUrl || "http://goatedcodoer:8076",
    token: serviceKey,
    companyCode: targetCode,
    companyName,
  };
}

/**
 * Dispatch fetch call to target Spring Boot
 */
export async function fetchFromTargetSpring(
  routing: ResolvedRouting,
  endpointPath: string,
  timeoutMs: number = 15000,
): Promise<Response> {
  if (routing.type === "missing_key") {
    return new Response(
      JSON.stringify({
        success: false,
        message: `No service key configured for company ${routing.companyCode}. Live ledger data is unavailable.`,
        missingKey: true,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const fullUrl = `${routing.baseUrl}${endpointPath.startsWith("/") ? "" : "/"}${endpointPath}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (routing.type === "service_token") {
    // Send X-Service-Token ONLY (omit Authorization)
    headers["X-Service-Token"] = routing.token!;
  } else {
    // User session
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(fullUrl, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}
