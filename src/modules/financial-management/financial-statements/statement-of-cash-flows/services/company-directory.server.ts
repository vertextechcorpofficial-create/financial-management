import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth-utils";

export interface CompanyListItem {
  company_id: number;
  company_code: string;
  company_name: string;
  springboot?: string;
  is_mother_company?: number | boolean;
  status?: string;
  is_deleted?: number | boolean;
}

export interface ClientCompanyOption {
  code: string;
  name: string;
  companyId?: number;
  isMotherCompany?: boolean;
  hasKey: boolean;
  isOwnCompany: boolean;
}

/**
 * Reads FM_COMPANY_KEYS from environment variables.
 * Fallback to MEN2 default if not configured in process.env.
 */
export function getCompanyServiceKeys(): Record<string, string> {
  const raw = process.env.FM_COMPANY_KEYS?.trim();
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      console.error("[company-directory] Failed to parse FM_COMPANY_KEYS JSON");
    }
  }

  // Built-in default key for dummy server MEN2
  return {
    MEN2: "rH_gl-Up0RdpgTEn1KoU8dLuIvX1B6aV6myP5K-m1zM",
  };
}

/**
 * Fetch active companies from Directus company_list collection
 */
export async function fetchActiveCompanyList(): Promise<CompanyListItem[]> {
  const directusBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const directusToken = (process.env.DIRECTUS_STATIC_TOKEN || "").trim();

  if (!directusBase) {
    console.warn("[company-directory] NEXT_PUBLIC_API_BASE_URL is not set.");
    return [];
  }

  try {
    const filter = encodeURIComponent(
      JSON.stringify({
        status: { _eq: "ACTIVE" },
        is_deleted: { _eq: 0 },
      }),
    );

    const url = `${directusBase}/items/company_list?filter=${filter}&fields=company_id,company_code,company_name,springboot,is_mother_company,status&limit=100`;

    const res = await fetch(url, {
      method: "GET",
      headers: directusToken ? { Authorization: `Bearer ${directusToken}` } : {},
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!res.ok) {
      console.error(`[company-directory] Failed to fetch company_list: ${res.status}`);
      return [];
    }

    const json = await res.json();
    return json.data || [];
  } catch (error) {
    console.error("[company-directory] Error fetching company_list:", error);
    return [];
  }
}

/**
 * Determine user's own home company from JWT session cookie
 */
export async function getUserCompanyCode(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length < 2) return null;
    let s = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const jsonStr = Buffer.from(s, "base64").toString("utf8");
    const payload = JSON.parse(jsonStr);

    return payload.company_code || payload.companyCode || null;
  } catch {
    return null;
  }
}
