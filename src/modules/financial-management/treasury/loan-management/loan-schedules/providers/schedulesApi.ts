import type { RefreshResult, SchedulePayload } from "../types";

const REQUEST_TIMEOUT_MS = 20000;

// A dropped connection must not leave the screen on skeletons forever.
function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}


export interface ScheduleRequest {
  loanId: number | null;
  version: number | null;
  asOf: string;
  status: string;
  dueFrom: string | null;
  dueTo: string | null;
  page: number;
  pageSize: number;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `The request failed (${response.status}).`;
  } catch {
    return `The request failed (${response.status}).`;
  }
}

export async function fetchSchedules(request: ScheduleRequest): Promise<SchedulePayload> {
  const params = new URLSearchParams();
  if (request.loanId !== null) params.set("loanId", String(request.loanId));
  if (request.version !== null) params.set("version", String(request.version));
  if (request.asOf) params.set("asOf", request.asOf);
  if (request.status && request.status !== "ALL") params.set("status", request.status);
  if (request.dueFrom) params.set("dueFrom", request.dueFrom);
  if (request.dueTo) params.set("dueTo", request.dueTo);
  params.set("page", String(request.page));
  params.set("pageSize", String(request.pageSize));

  const response = await fetchWithTimeout(`/api/fm/treasury/loan-management/loan-schedules?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: SchedulePayload };
  return body.data;
}

export async function runStatusRefresh(input: {
  asOf: string;
  loanId: number | null;
  dryRun: boolean;
}): Promise<RefreshResult> {
  const response = await fetchWithTimeout("/api/fm/treasury/loan-management/loan-schedules/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: RefreshResult };
  return body.data;
}
