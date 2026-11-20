import { EQUITY_GL_ACCOUNTS } from "../constants/components";

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
}

// In-memory short-term cache (TTL 60s) to speed up navigation and prevent repetitive backend queries
interface CacheRecord {
  timestamp: number;
  data: MasterLedgerEntry[];
}
const queryCache = new Map<string, CacheRecord>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

/**
 * Fetches journal entries for a date range from view-general-ledger-master
 * If accountNumber is provided, filters for that specific account.
 * If accountNumber is omitted, fetches all journal entries across the date range in 1 single HTTP request.
 */
export async function fetchMasterLedgerRange(
  startDate: string,
  endDate: string,
  token?: string,
  accountNumber?: string
): Promise<MasterLedgerEntry[]> {
  const baseUrl = process.env.SPRING_API_BASE_URL;
  if (!baseUrl) {
    return [];
  }

  const cleanBase = baseUrl.replace(/\/+$/, "");
  let url = `${cleanBase}/api/view-general-ledger-master/filter?startDate=${startDate}&endDate=${endDate}`;
  if (accountNumber) {
    url += `&accountNumber=${encodeURIComponent(accountNumber)}`;
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
        `[SCE Backend] Failed to fetch ledger range (${startDate} to ${endDate}${
          accountNumber ? ` acc: ${accountNumber}` : ""
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
    console.warn(`[SCE Backend] Network error fetching ledger range:`, err);
    return [];
  }
}

/**
 * Fetches journal entries for a single account from view-general-ledger-master
 * (Used for drill-down into specific account entries)
 */
export async function fetchEntriesForAccount(
  accountNumber: string,
  startDate: string,
  endDate: string,
  token?: string
): Promise<MasterLedgerEntry[]> {
  return fetchMasterLedgerRange(startDate, endDate, token, accountNumber);
}

/**
 * Unified equity fetch:
 * Executes 1 single GET request to view-general-ledger-master for the date range
 * and filters for the 15 equity accounts (3010-3900) in-memory.
 * Eliminates 15 concurrent parallel requests and avoids HTTP 429 rate limiting.
 */
export async function fetchAllEquityLedgerEntries(
  startDate: string,
  endDate: string,
  token?: string
): Promise<MasterLedgerEntry[]> {
  try {
    const allEntries = await fetchMasterLedgerRange(startDate, endDate, token);
    const equityCodes = new Set(EQUITY_GL_ACCOUNTS.map((a) => a.glCode));

    return allEntries.filter(
      (entry) => entry.accountNumber && equityCodes.has(entry.accountNumber)
    );
  } catch (error) {
    console.error("[SCE Backend] Error in unified equity fetch:", error);
    return [];
  }
}
