import type { RefreshResult, SchedulePayload } from "../types";

export interface ScheduleRequest {
  loanId: number | null;
  version: number | null;
  asOf: string;
  status: string;
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
  params.set("page", String(request.page));
  params.set("pageSize", String(request.pageSize));

  const response = await fetch(`/api/fm/treasury/loan-management/loan-schedules?${params.toString()}`, {
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
  const response = await fetch("/api/fm/treasury/loan-management/loan-schedules/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: RefreshResult };
  return body.data;
}
