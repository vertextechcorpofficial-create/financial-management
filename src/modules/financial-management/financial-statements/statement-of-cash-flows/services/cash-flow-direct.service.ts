import {
  CFSSummaryResponse,
  CFSEntriesResponse,
  CFSJournalDetails,
} from "../types";

export interface FetchSummaryParams {
  startDate: string;
  endDate: string;
  groupBy?: "day" | "week" | "month";
  companyCode?: string;
  signal?: AbortSignal;
}

export interface FetchEntriesParams {
  startDate: string;
  endDate: string;
  activity?: "OPERATING" | "INVESTING" | "FINANCING" | "UNCLASSIFIED";
  coaId?: number | string;
  page?: number;
  size?: number;
  companyCode?: string;
  signal?: AbortSignal;
}

/**
 * Fetch Level 1: Summary from backend BFF
 */
export async function getLiveCashFlowSummary(
  params: FetchSummaryParams,
): Promise<CFSSummaryResponse> {
  const query = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    groupBy: params.groupBy || "month",
  });

  if (params.companyCode) {
    query.set("companyCode", params.companyCode);
  }

  const res = await fetch(
    `/api/fm/financial-statements/statement-of-cash-flow/summary?${query.toString()}`,
    {
      method: "GET",
      cache: "no-store",
      signal: params.signal,
    },
  );

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.message || `Summary request failed (${res.status})`);
  }

  return res.json();
}

/**
 * Fetch Level 2: Entries (vouchers) from backend BFF
 */
export async function getLiveCashFlowEntries(
  params: FetchEntriesParams,
): Promise<CFSEntriesResponse> {
  const query = new URLSearchParams({
    startDate: params.startDate,
    endDate: params.endDate,
    page: String(params.page ?? 0),
    size: String(params.size ?? 25),
  });

  if (params.activity) query.set("activity", params.activity);
  if (params.coaId !== undefined && params.coaId !== null && params.coaId !== "") {
    query.set("coaId", String(params.coaId));
  }
  if (params.companyCode) {
    query.set("companyCode", params.companyCode);
  }

  const res = await fetch(
    `/api/fm/financial-statements/statement-of-cash-flow/entries?${query.toString()}`,
    {
      method: "GET",
      cache: "no-store",
      signal: params.signal,
    },
  );

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.message || `Entries request failed (${res.status})`);
  }

  return res.json();
}

/**
 * Fetch Level 3: Journal transaction details
 */
export async function getLiveCashFlowTransactionDetails(
  journalEntryId: string,
  sourceModule: string,
  companyCode?: string,
  signal?: AbortSignal,
): Promise<CFSJournalDetails> {
  const query = new URLSearchParams({ journalEntryId, sourceModule });
  if (companyCode) query.set("companyCode", companyCode);

  const res = await fetch(
    `/api/fm/financial-statements/statement-of-cash-flow/transactions?${query.toString()}`,
    {
      method: "GET",
      cache: "no-store",
      signal,
    },
  );

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.message || `Transaction details failed (${res.status})`);
  }

  return res.json();
}
