export interface MasterLedgerEntry {
  jeGroupCounter?: number;
  jeNo: string;
  sourceModule?: string;
  transactionRef?: string;
  transactionDate: string;
  description?: string;
  status?: string;
  division?: string | null;
  divisionName?: string | null;
  department?: string | null;
  departmentName?: string | null;
  creator?: string | null;
  coaId?: number | null;
  accountNumber?: string | null;
  accountTitle?: string | null;
  debit: number;
  credit: number;
  branchId?: string | null;
  branchName?: string | null;
  postingDate?: string | null;
  sceCode?: string | null;
  generated?: boolean;
}

// In-memory short-term cache (TTL 60s) to speed up navigation and prevent repetitive backend queries
interface CacheRecord {
  timestamp: number;
  data: MasterLedgerEntry[];
}
const queryCache = new Map<string, CacheRecord>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Fetches journal entries for a date range from view-fs-report-statement-equity/entries
 * Returns ONLY equity lines (not the whole ledger).
 * If sceCode is provided, filters for that specific statement account.
 */
export async function fetchMasterLedgerRange(
  startDate: string,
  endDate: string,
  token?: string,
  sceCode?: string
): Promise<MasterLedgerEntry[]> {
  const baseUrl = process.env.SPRING_API_BASE_URL;
  if (!baseUrl) {
    return [];
  }

  const cleanBase = baseUrl.replace(/\/+$/, "");
  let url = `${cleanBase}/api/view-fs-report-statement-equity/entries?startDate=${startDate}&endDate=${endDate}&postedOnly=true`;
  if (sceCode) {
    url += `&sceCode=${encodeURIComponent(sceCode)}`;
  }

  // Check cache
  const cacheKey = `${url}:${token || "anon"}`;
  const cached = queryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const headers: Record<string, string> = {
    "cache-no-store": "true",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(
        `[SCE Backend] Failed to fetch equity entries (${startDate} to ${endDate}${
          sceCode ? ` sceCode: ${sceCode}` : ""
        }): ${res.status} ${res.statusText}`
      );
      return [];
    }

    const data = await res.json();
    const result = Array.isArray(data) ? (data as MasterLedgerEntry[]) : [];

    // Save to cache
    queryCache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  } catch (err) {
    console.warn(`[SCE Backend] Network error fetching equity entries:`, err);
    return [];
  }
}

/**
 * Fetches journal entries for a single statement account (sceCode) from view-fs-report-statement-equity/entries
 * (Used for drill-down into specific account entries)
 */
export async function fetchEntriesForAccount(
  sceCode: string,
  startDate: string,
  endDate: string,
  token?: string
): Promise<MasterLedgerEntry[]> {
  return fetchMasterLedgerRange(startDate, endDate, token, sceCode);
}

/**
 * Unified equity fetch:
 * Executes 1 single GET request to view-fs-report-statement-equity/entries for the date range.
 * The endpoint returns strictly the mapped equity entries + generated monthly net income.
 */
export async function fetchAllEquityLedgerEntries(
  startDate: string,
  endDate: string,
  token?: string
): Promise<MasterLedgerEntry[]> {
  try {
    const entries = await fetchMasterLedgerRange(startDate, endDate, token);
    return entries;
  } catch (error) {
    console.error("[SCE Backend] Error in unified equity fetch:", error);
    return [];
  }
}
