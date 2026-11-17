import type { PaymentForm } from "../schemas";
import type {
  AllocationRow,
  LoanOption,
  PaymentContext,
  PaymentListRow,
  PaymentsSummary,
} from "../types";

export interface PaymentsQuery {
  q: string;
  method: string;
  status: string;
  loanId: number | null;
  page: number;
  pageSize: number;
}

export interface PaymentsPayload {
  rows: PaymentListRow[];
  total: number;
  summary: PaymentsSummary;
}

function toQuery(query: PaymentsQuery): string {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set("q", query.q.trim());
  if (query.method && query.method !== "ALL") params.set("method", query.method);
  if (query.status && query.status !== "ALL") params.set("status", query.status);
  if (query.loanId) params.set("loanId", String(query.loanId));
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  return params.toString();
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

export async function fetchPayments(query: PaymentsQuery): Promise<PaymentsPayload> {
  const response = await fetch(`/api/fm/treasury/loan-management/loan-payments?${toQuery(query)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: PaymentsPayload };
  return body.data;
}

export async function fetchLoanOptions(): Promise<LoanOption[]> {
  const response = await fetch("/api/fm/treasury/loan-management/loan-payments/loans", { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: { loans: LoanOption[] } };
  return body.data.loans;
}

export async function fetchPaymentContext(loanId: number): Promise<PaymentContext> {
  const response = await fetch(`/api/fm/treasury/loan-management/loan-payments/context?loanId=${loanId}`, {
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
  const response = await fetch(`/api/fm/treasury/loan-management/loan-payments/${id}`, { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: PaymentDetailPayload };
  return body.data;
}

export async function recordPayment(payload: PaymentForm): Promise<PaymentListRow> {
  const response = await fetch("/api/fm/treasury/loan-management/loan-payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: PaymentListRow };
  return body.data;
}

export async function reversePayment(id: number): Promise<PaymentListRow> {
  const response = await fetch(`/api/fm/treasury/loan-management/loan-payments/${id}`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: PaymentListRow };
  return body.data;
}
