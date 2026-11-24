import type { AgencyChoice, DocumentKind, EmployeeChoice, FieldErrors, LoanRequest, Page, RequestAssessment, RequestForm, RequestListItem } from "./types";

const endpoint = "/api/fm/government-loans/loan-applications/requests";

export class RequestApiError extends Error {
  constructor(message: string, readonly status: number, readonly fieldErrors?: FieldErrors) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint + path, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new RequestApiError(data?.message ?? "The loan request could not be loaded. Try again.", response.status, data?.fieldErrors);
  }
  return data;
}

const json = (method: string, body: object, key?: string): RequestInit => ({
  method, body: JSON.stringify(body),
  headers: { "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
});

export const getRequests = (query: string, signal: AbortSignal) => request<Page<RequestListItem>>("?" + query, { signal });
export const getRequest = (id: number, signal: AbortSignal) => request<LoanRequest>("/" + id, { signal });
export const agencyOptions = (page: number, signal: AbortSignal) => request<Page<AgencyChoice>>("/options?type=agencies&page=" + page, { signal });
export const employeeOptions = (query: string, signal: AbortSignal) => request<Page<EmployeeChoice>>("/options?" + query, { signal });
export const assess = (form: RequestForm, signal: AbortSignal) =>
  request<RequestAssessment>("/assess", { ...json("POST", { form }), signal });

export function saveDraft(form: RequestForm, current: LoanRequest | null, key: string) {
  return current ? request<LoanRequest>("/" + current.id, json("PATCH", { form, expectedRevision: current.revision }, key)) :
    request<LoanRequest>("", json("POST", { form }, key));
}

export const submitDraft = (record: LoanRequest, key: string) =>
  request<LoanRequest>("/" + record.id + "/submit", json("POST", { expectedRevision: record.revision }, key));

export const cancelRequest = (record: LoanRequest, reason: string, key: string) =>
  request<LoanRequest>("/" + record.id + "/cancel", json("POST", { expectedRevision: record.revision, reason }, key));

const documentPath = (id: number, kind: DocumentKind) => "/" + id + "/documents/" + kind;
export const requestDocumentUrl = (id: number, kind: DocumentKind) => endpoint + documentPath(id, kind);

export function uploadRequestDocument(record: LoanRequest, kind: DocumentKind, file: File, key: string) {
  const body = new FormData();
  body.append("documentTypeId", "1");
  body.append("uploadKey", key);
  body.append("files", file);
  return request<LoanRequest>(documentPath(record.id, kind), {
    method: "POST", body, headers: { "If-Match": String(record.revision) },
  });
}
