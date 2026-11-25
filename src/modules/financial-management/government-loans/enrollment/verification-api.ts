import { RequestApiError } from "../requests/request-api";
import type { HandoffResult } from "../payroll-handoff/types";
import type { EnrollmentEvidenceKind } from "../requests/types";
import type { BulkVerificationResult, EnrollmentDecision, VerificationQueue, VerificationReview, VerificationSelection } from "./verification-types";

const endpoint = "/api/fm/government-loans/loan-approval/enrollment-verification";

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(endpoint + path, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new RequestApiError(data?.message ?? "Enrollment verification could not complete the request. Try again.", response.status, data?.fieldErrors);
  }
  return data;
}

const post = (body: object, key: string): RequestInit => ({
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "Idempotency-Key": key },
});

export const listVerification = (query: string, signal: AbortSignal) => request<VerificationQueue>("?" + query, { signal });
export const getVerification = (id: number, signal: AbortSignal) => request<VerificationReview>(`/${id}`, { signal });
export const verificationEvidenceUrl = (id: number, kind: EnrollmentEvidenceKind) => `${endpoint}/${id}/evidence/${kind}`;
export const decideVerification = (id: number, expectedRevision: number, decision: EnrollmentDecision, reason: string, key: string) =>
  request<{ id: number; revision: number; status: "ACTIVE" | "VERIFIED" | "RETURNED" }>(`/${id}/decision`, post({ expectedRevision, decision, reason }, key));
export const bulkVerify = (items: VerificationSelection[], key: string) => request<BulkVerificationResult>("/bulk-verify", post({ items }, key));
export const activateEnrollment = (id: number, expectedRevision: number, key: string) =>
  request<HandoffResult>(`/${id}/activate`, post({ expectedRevision }, key));
export const payrollEvidenceUrl = (id: number, revision: number) => `${endpoint}/${id}/payroll-handoff?revision=${revision}`;

export function importPayrollAcknowledgement(id: number, revision: number, file: File) {
  return request<HandoffResult & { reason: string | null }>(`/${id}/payroll-handoff`, {
    method: "POST", body: file, headers: {
      "Content-Type": "text/csv", "If-Match": String(revision), "X-Payroll-File-Name": encodeURIComponent(file.name),
    },
  });
}
