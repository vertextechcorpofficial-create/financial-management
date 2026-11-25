import type { PaymentForm } from "../schemas";
import type {
  AllocationRow,
  LoanHistoryRow,
  PaymentContext,
  PaymentListRow,
  PaymentLoanRow,
} from "../types";

const REQUEST_TIMEOUT_MS = 20000;

// A dropped connection must not leave the screen on skeletons forever.
function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}


async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; fieldErrors?: Record<string, string[]> };
    if (body.fieldErrors) {
      const first = Object.values(body.fieldErrors)[0];
      if (first?.[0]) return first[0];
    }
    if (body.error) return body.error;
  } catch {
    // Fall through to the generic sentence below.
  }
  return `The request failed (${response.status}).`;
}

export interface DirectoryQuery {
  q: string;
  status: string;
  lenderType: string;
  method: string;
  page: number;
  pageSize: number;
}

export async function fetchLoanDirectory(query: DirectoryQuery): Promise<{ rows: PaymentLoanRow[]; total: number }> {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set("q", query.q.trim());
  if (query.status && query.status !== "ALL") params.set("status", query.status);
  if (query.lenderType && query.lenderType !== "ALL") params.set("lenderType", query.lenderType);
  if (query.method && query.method !== "ALL") params.set("method", query.method);
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));

  const response = await fetchWithTimeout(`/api/fm/treasury/loan-management/loan-payments/directory?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: { rows: PaymentLoanRow[]; total: number } };
  return body.data;
}

export async function fetchLoanHistory(
  loanId: number,
  filters: { accountId: number | null; from: string; to: string },
): Promise<LoanHistoryRow[]> {
  const params = new URLSearchParams({ loanId: String(loanId) });
  if (filters.accountId) params.set("accountId", String(filters.accountId));
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);

  const response = await fetchWithTimeout(`/api/fm/treasury/loan-management/loan-payments/history?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: { rows: LoanHistoryRow[] } };
  return body.data.rows;
}

export async function fetchPaymentContext(loanId: number): Promise<PaymentContext> {
  const response = await fetchWithTimeout(`/api/fm/treasury/loan-management/loan-payments/context?loanId=${loanId}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: PaymentContext };
  return body.data;
}

export interface PaymentDetailPayload {
  payment: PaymentListRow;
  allocations: AllocationRow[];
  reversible: { allowed: boolean; reason: string | null };
}

export async function fetchPayment(id: number): Promise<PaymentDetailPayload> {
  const response = await fetchWithTimeout(`/api/fm/treasury/loan-management/loan-payments/${id}`, { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: PaymentDetailPayload };
  return body.data;
}

export async function recordPayment(payload: PaymentForm): Promise<PaymentListRow> {
  const response = await fetchWithTimeout("/api/fm/treasury/loan-management/loan-payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: PaymentListRow };
  return body.data;
}

export async function reversePayment(id: number): Promise<PaymentListRow> {
  const response = await fetchWithTimeout(`/api/fm/treasury/loan-management/loan-payments/${id}`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: PaymentListRow };
  return body.data;
}
