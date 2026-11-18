import type { LedgerState, Portfolio } from "../types";
import type { LedgerPage } from "../navigation";
const URL = "/api/fm/property-ledger";
async function request<T>(page: LedgerPage, init?: RequestInit): Promise<T> {
  const res = await fetch(`${URL}?page=${page}`, { ...init, cache: "no-store", headers: { "Content-Type": "application/json" } });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Property Ledger request failed");
  return json as T;
}
export const ledgerService = {
  load: (page: LedgerPage = "dashboard", signal?: AbortSignal) => request<LedgerState>(page, { signal }),
  save: (revision: number, portfolio: Portfolio, page: LedgerPage = "dashboard") => request<{ revision: number }>(page, { method: "POST", body: JSON.stringify({ revision, portfolio }) }),
};
