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

/**
 * Fetches journal entries for a single account from view-general-ledger-master
 */
export async function fetchEntriesForAccount(
  accountNumber: string,
  startDate: string,
  endDate: string,
  token?: string
): Promise<MasterLedgerEntry[]> {
  const baseUrl = process.env.SPRING_API_BASE_URL;
  if (!baseUrl) {
    return [];
  }

  const cleanBase = baseUrl.replace(/\/+$/, "");
  const url = `${cleanBase}/api/view-general-ledger-master/filter?startDate=${startDate}&endDate=${endDate}&accountNumber=${accountNumber}`;

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
      console.warn(`[SCE Backend] Failed to fetch account ${accountNumber}: ${res.status} ${res.statusText}`);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data) ? (data as MasterLedgerEntry[]) : [];
  } catch (err) {
    console.warn(`[SCE Backend] Network error fetching account ${accountNumber}:`, err);
    return [];
  }
}

/**
 * Fetches all equity journal entries across the 15 accounts in parallel
 */
export async function fetchAllEquityLedgerEntries(
  startDate: string,
  endDate: string,
  token?: string
): Promise<MasterLedgerEntry[]> {
  const equityGlCodes = EQUITY_GL_ACCOUNTS.map((a) => a.glCode);

  try {
    const results = await Promise.all(
      equityGlCodes.map((code) => fetchEntriesForAccount(code, startDate, endDate, token))
    );

    return results.flat();
  } catch (error) {
    console.error("[SCE Backend] Error in parallel fetch:", error);
    return [];
  }
}
