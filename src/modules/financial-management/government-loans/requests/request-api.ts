import type { AgencyChoice, DocumentKind, EmployeeChoice, FieldErrors, LoanRequest, Page, RequestAssessment, RequestForm, RequestPage } from "./types";

export class RequestApiError extends Error {
  constructor(message: string, readonly status: number, readonly fieldErrors?: FieldErrors) {
    super(message);
  }
}

async function fetchRequest<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
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

const documentPath = (id: number, kind: DocumentKind) => "/" + id + "/documents/" + kind;

function requestApi(workspace: "loan-applications" | "my-loans") {
  const endpoint = "/api/fm/government-loans/" + workspace + "/requests";
  const request = <T>(path: string, init?: RequestInit) => fetchRequest<T>(endpoint + path, init);
  return {
    getRequests: (query: string, signal: AbortSignal) => request<RequestPage>("?" + query, { signal }),
    getRequest: (id: number, signal: AbortSignal) => request<LoanRequest>("/" + id, { signal }),
    agencyOptions: (page: number, signal: AbortSignal) => request<Page<AgencyChoice>>("/options?type=agencies&page=" + page, { signal }),
    employeeOptions: (query: string, signal: AbortSignal) => {
      const params = new URLSearchParams(query);
      params.set("type", workspace === "my-loans" ? "co-makers" : "employees");
      return request<Page<EmployeeChoice>>("/options?" + params, { signal });
    },
    assess: (form: RequestForm, signal: AbortSignal) => request<RequestAssessment>("/assess", { ...json("POST", { form }), signal }),
    saveDraft: (form: RequestForm, current: LoanRequest | null, key: string) => current
      ? request<LoanRequest>("/" + current.id, json("PATCH", { form, expectedRevision: current.revision }, key))
      : request<LoanRequest>("", json("POST", { form }, key)),
    submitDraft: (record: LoanRequest, key: string) =>
      request<LoanRequest>("/" + record.id + "/submit", json("POST", { expectedRevision: record.revision }, key)),
    cancelRequest: (record: LoanRequest, reason: string, key: string) =>
      request<LoanRequest>("/" + record.id + "/cancel", json("POST", { expectedRevision: record.revision, reason }, key)),
    requestDocumentUrl: (id: number, kind: DocumentKind) => endpoint + documentPath(id, kind),
    uploadRequestDocument(record: LoanRequest, kind: DocumentKind, file: File, key: string) {
      const body = new FormData();
      body.append("documentTypeId", "1");
      body.append("uploadKey", key);
      body.append("files", file);
      return request<LoanRequest>(documentPath(record.id, kind), {
        method: "POST", body, headers: { "If-Match": String(record.revision) },
      });
    },
  };
}

export const staffRequestApi = requestApi("loan-applications");
export const employeeRequestApi = requestApi("my-loans");
export const { agencyOptions, requestDocumentUrl } = staffRequestApi;
