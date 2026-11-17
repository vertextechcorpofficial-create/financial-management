import type { EntriesPayload, EntryType, SummaryPayload } from "../types";

export interface JournalRequest {
  view: "entries" | "summary";
  q: string;
  loanId: number | null;
  entryType: EntryType | "ALL";
  coaId: number | null;
  from: string;
  to: string;
  page: number;
  pageSize: number;
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

const BASE = "/api/fm/treasury/loan-management/loan-journal";

function toQuery(request: JournalRequest): string {
  const params = new URLSearchParams({ view: request.view, page: String(request.page), pageSize: String(request.pageSize) });
  if (request.q.trim()) params.set("q", request.q.trim());
  if (request.loanId) params.set("loanId", String(request.loanId));
  if (request.entryType !== "ALL") params.set("entryType", request.entryType);
  if (request.coaId) params.set("coaId", String(request.coaId));
  if (request.from) params.set("from", request.from);
  if (request.to) params.set("to", request.to);
  return params.toString();
}

async function readJson<T>(url: string, fallback: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  const body = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!response.ok || !body?.success || body.data === undefined) {
    throw new Error(body?.error || fallback);
  }
  return body.data;
}

export function fetchEntries(request: JournalRequest): Promise<EntriesPayload> {
  return readJson<EntriesPayload>(`${BASE}?${toQuery(request)}`, "The journal entries could not be read.");
}

export function fetchSummary(request: JournalRequest): Promise<SummaryPayload> {
  return readJson<SummaryPayload>(`${BASE}?${toQuery(request)}`, "The account summary could not be read.");
}
