import type { ApprovalDetail, ApprovalQueueRow, ReleaseChannel } from "../types";

export interface QueuePayload {
  rows: ApprovalQueueRow[];
  total: number;
  counts: Record<string, number>;
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
  if (query.status && query.status !== "ALL") params.set("status", query.status);
  if (query.lenderType && query.lenderType !== "ALL") params.set("lenderType", query.lenderType);
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
  const response = await fetch(`/api/fm/treasury/loan-management/loan-approvals?${toQuery(query)}`, {
    cache: "no-store",
  });
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
  const response = await fetch(`/api/fm/treasury/loan-management/loan-approvals/${id}?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: ApprovalDetail };
  return body.data;
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: T };
  return body.data;
}

export function approveLoan(id: number, remarks: string) {
  return post<{ loanNo: string; selfApproved: boolean }>(
    `/api/fm/treasury/loan-management/loan-approvals/${id}/approve`,
    { remarks },
  );
}

export function rejectLoan(id: number, reason: string) {
  return post<{ loanNo: string }>(`/api/fm/treasury/loan-management/loan-approvals/${id}/reject`, { reason });
}

export function releaseLoan(
  id: number,
  input: { releaseDate: string; channel: ReleaseChannel; accountId: number | null },
) {
  return post<{ loanNo: string; entryNo: string; totalDebit: number; scheduleRows: number; lines: number }>(
    `/api/fm/treasury/loan-management/loan-approvals/${id}/release`,
    input,
  );
}
