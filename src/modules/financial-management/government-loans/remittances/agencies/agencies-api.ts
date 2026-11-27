import type { Agency, AgencyHistoryPage, AgencyPage } from "./types";

const endpoint = "/api/fm/government-loans/remittances/agencies";

export class AgencyRequestError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(`${endpoint}${path}`, { ...options, cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload === null) {
    throw new AgencyRequestError(payload?.message ?? "The agency request failed. Please try again.", payload?.field);
  }
  return payload;
}

export function fetchAgencies(query: string, signal: AbortSignal) {
  return request<AgencyPage>(`?${query}`, { signal });
}

export function fetchAgencyHistory(id: number, page: number, signal: AbortSignal) {
  return request<AgencyHistoryPage>(`/${id}/history?page=${page}`, { signal });
}

export function saveAgency(body: object, id?: number) {
  return request<Agency>(id === undefined ? "" : `/${id}`, {
    method: id === undefined ? "POST" : "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
