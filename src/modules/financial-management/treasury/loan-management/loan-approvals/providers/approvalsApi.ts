import type {
  ApprovalDetail,
  ApprovalQueueRow,
  ReleaseChannel,
} from "../types";

const REQUEST_TIMEOUT_MS = 20000;

// A dropped connection must not leave the screen on skeletons forever.
function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}


export interface QueuePayload {
  rows: ApprovalQueueRow[];
  total: number;
}

export interface QueueQuery {
  q: string;
  status: string;
  lenderType: string;
  page: number;
  pageSize: number;
}

function toQuery(query: QueueQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status && query.status !== "ALL")
    params.set("status", query.status);
  if (query.lenderType && query.lenderType !== "ALL")
    params.set("lenderType", query.lenderType);
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  return params.toString();
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `The request failed (${response.status}).`;
  } catch {
    return `The request failed (${response.status}).`;
  }
}

export async function fetchQueue(query: QueueQuery): Promise<QueuePayload> {
  const response = await fetchWithTimeout(
    `/api/fm/treasury/loan-management/loan-approvals?${toQuery(query)}`,
    {
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: QueuePayload };
  return body.data;
}

export async function fetchDetail(
  id: number,
  channel: ReleaseChannel = "TRANSFER",
  accountId: number | null = null,
): Promise<ApprovalDetail> {
  const params = new URLSearchParams({ channel });
  if (accountId) params.set("accountId", String(accountId));
  const response = await fetchWithTimeout(
    `/api/fm/treasury/loan-management/loan-approvals/${id}?${params.toString()}`,
    {
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: ApprovalDetail };
  return body.data;
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetchWithTimeout(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: T };
  return body.data;
}

export function approveLoan(id: number, remarks: string) {
  return post<{
    loanNo: string;
    selfApproved: boolean;
    status: "CURRENT";
    entryNo: string;
    totalDebit: number;
    scheduleRows: number;
    lines: number;
  }>(`/api/fm/treasury/loan-management/loan-approvals/${id}/approve`, {
    remarks,
  });
}

export function rejectLoan(id: number, reason: string) {
  return post<{ loanNo: string }>(
    `/api/fm/treasury/loan-management/loan-approvals/${id}/reject`,
    { reason },
  );
}
