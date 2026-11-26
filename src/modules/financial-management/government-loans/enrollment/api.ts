import type { EnrollmentEvidenceKind, Page } from "../requests/types";
import type { EnrollmentImportBatch, EnrollmentImportHistory, EnrollmentImportPreview } from "./import-types";
import type { EnrollmentDetail, EnrollmentOutcome, EnrollmentPage, EnrollmentTerms, ExistingLoanForm, ExistingLoanReview, PriorLoan } from "./types";

const endpoint = "/api/fm/government-loans/loan-applications/enrollment";

export class EnrollmentApiError extends Error {
  constructor(message: string, readonly status: number, readonly fieldErrors?: Record<string, string>, readonly preview?: EnrollmentImportPreview) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint + path, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new EnrollmentApiError(data?.message ?? "The enrollment service could not complete the request.", response.status, data?.fieldErrors, data?.preview);
  }
  return data;
}

const mutation = (path: string, body: object, key: string) => request<EnrollmentOutcome>(path, {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", "Idempotency-Key": key },
});

export const listEnrollments = (query: string, signal: AbortSignal) => request<EnrollmentPage>("?" + query, { signal });
export const getEnrollment = (id: number, signal: AbortSignal) => request<EnrollmentDetail>("/" + id, { signal });
export const priorLoans = (employeeId: number, agencyId: number, signal: AbortSignal) =>
  request<{ items: PriorLoan[]; supported: boolean }>("/options?" + new URLSearchParams({
    employeeId: String(employeeId), agencyId: String(agencyId),
  }), { signal });

export const enrollRequest = (record: EnrollmentDetail, form: EnrollmentTerms, key: string) =>
  mutation("/" + record.id + "/enroll", { form, expectedRevision: record.request.revision }, key);
export const resubmitEnrollment = (record: EnrollmentDetail, form: EnrollmentTerms, key: string) =>
  mutation("/" + record.id + "/resubmit", { form, expectedRevision: record.request.revision }, key);
export const previewExisting = (form: ExistingLoanForm) => request<ExistingLoanReview>("/existing-preview", {
  method: "POST", body: JSON.stringify({ form }), headers: { "Content-Type": "application/json" },
});
export const enrollExisting = (form: ExistingLoanForm, key: string, previewToken?: string) => mutation("", { form, previewToken }, key);
export const declineAgency = (record: EnrollmentDetail, reason: string, key: string) =>
  mutation("/" + record.id + "/decline", { reason, expectedRevision: record.request.revision }, key);

const evidencePath = (id: number, kind: EnrollmentEvidenceKind) => `/${id}/evidence/${kind}`;
export const enrollmentEvidenceUrl = (id: number, kind: EnrollmentEvidenceKind) => endpoint + evidencePath(id, kind);
export function uploadEnrollmentEvidence(record: EnrollmentDetail, kind: EnrollmentEvidenceKind, file: File, key: string) {
  const body = new FormData();
  body.append("documentTypeId", "1");
  body.append("uploadKey", key);
  body.append("files", file);
  return request<{ id: number; revision: number }>(evidencePath(record.id, kind), {
    method: "POST", body, headers: { "If-Match": String(record.request.revision) },
  });
}

export const setEnrollmentTransfer = (record: EnrollmentDetail, transfer: boolean, key: string) =>
  request<{ id: number; revision: number }>(`/${record.id}/transfer`, {
    method: "POST", body: JSON.stringify({ transfer, expectedRevision: record.request.revision }),
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
  });

function importUpload(file: File, columns?: number[], token?: string) {
  const data = new FormData();
  data.set("file", file);
  if (columns) data.set("columns", JSON.stringify(columns));
  if (token) data.set("previewToken", token);
  return data;
}

export const previewImport = (file: File, columns?: number[]) =>
  request<EnrollmentImportPreview>("/imports/preview", { method: "POST", body: importUpload(file, columns) });
export const saveImport = (file: File, columns: number[], previewToken: string, key: string) =>
  request<{ id: number }>("/imports", { method: "POST", body: importUpload(file, columns, previewToken), headers: { "Idempotency-Key": key } });
export const importBatches = (page: number, signal: AbortSignal) =>
  request<Page<EnrollmentImportBatch>>("/imports?page=" + page, { signal });
export const importBatch = (id: number, signal: AbortSignal) => request<EnrollmentImportHistory>("/imports/" + id, { signal });
