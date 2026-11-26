import { RequestApiError } from "../requests/request-api";
import type { DocumentKind, Page } from "../requests/types";
import type { ApprovalDecisionRow, ApprovalQueuePage, ApprovalReview, ApprovalSelection, BulkApprovalResult, CompanyDecision } from "./types";

const endpoint = "/api/fm/government-loans/loan-approval/requests";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint + path, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new RequestApiError(data?.message ?? "The approval request could not be completed. Try again.", response.status, data?.fieldErrors);
  }
  return data;
}

const post = (body: object, key: string): RequestInit => ({
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "Idempotency-Key": key },
});

export const approvalQueue = (query: string, signal: AbortSignal) => request<ApprovalQueuePage>("?" + query, { signal });
export const approvalDecisions = (page: number, signal: AbortSignal) => request<Page<ApprovalDecisionRow>>("?view=decisions&page=" + page, { signal });
export const approvalReview = (id: number, signal: AbortSignal) => request<ApprovalReview>("/" + id, { signal });
export const approvalDocumentUrl = (id: number, kind: DocumentKind) => `${endpoint}/${id}/documents/${kind}`;

export async function approvalAgencies(signal: AbortSignal) {
  const agencies: { id: number; name: string }[] = [];
  for (let page = 1; ; page++) {
    const result = await request<Page<{ id: number; name: string }>>("?view=agencies&page=" + page, { signal });
    agencies.push(...result.items);
    if (!result.hasMore) return agencies;
  }
}

export const decideApproval = (id: number, expectedRevision: number, action: CompanyDecision, remarks: string, key: string) =>
  request<{ reference: string; decision: "APPROVED" | "REJECTED" }>(`/${id}/decision`, post({ action, expectedRevision, remarks }, key));

export const bulkApprove = (items: ApprovalSelection[], remarks: string, key: string) =>
  request<BulkApprovalResult>("/bulk-approve", post({ items, remarks }, key));
