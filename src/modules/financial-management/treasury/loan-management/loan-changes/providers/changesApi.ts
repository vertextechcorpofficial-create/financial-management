import type {
  ChangeContext,
  ChangeListRow,
  ChangesPayload,
  RecordChangeRequest,
} from "../types";

const BASE = "/api/fm/treasury/loan-management/loan-changes";

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  let body: Envelope<T> | null = null;
  try {
    body = (await response.json()) as Envelope<T>;
  } catch {
    body = null;
  }
  if (!response.ok || body?.success === false) {
    const fieldMessage = body?.fieldErrors
      ? Object.values(body.fieldErrors).flat().filter(Boolean).join(" ")
      : "";
    throw new Error(fieldMessage || body?.error || fallback);
  }
  return body?.data as T;
}

export interface ChangesRequest {
  q?: string;
  kind?: string;
  loanId?: number | null;
  from?: string | null;
  to?: string | null;
  page: number;
  pageSize: number;
}

function toQuery(params: ChangesRequest): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.kind && params.kind !== "ALL") search.set("kind", params.kind);
  if (params.loanId) search.set("loanId", String(params.loanId));
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  search.set("page", String(params.page));
  search.set("pageSize", String(params.pageSize));
  return search.toString();
}

export async function fetchChanges(params: ChangesRequest): Promise<ChangesPayload> {
  const response = await fetch(`${BASE}?${toQuery(params)}`, { cache: "no-store" });
  return readJson<ChangesPayload>(response, "The changes could not be read.");
}

export async function fetchChangeContext(loanId: number): Promise<ChangeContext> {
  const response = await fetch(`${BASE}?loanId=${loanId}`, { cache: "no-store" });
  return readJson<ChangeContext>(response, "That loan could not be read.");
}

export async function recordChangeRequest(payload: RecordChangeRequest): Promise<ChangeListRow> {
  const response = await fetch(`${BASE}/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return readJson<ChangeListRow>(response, "The change could not be recorded.");
}

export async function reverseChangeRequest(id: number, reason: string | null): Promise<ChangeListRow> {
  const response = await fetch(`${BASE}/${id}/reverse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  return readJson<ChangeListRow>(response, "The change could not be reversed.");
}
