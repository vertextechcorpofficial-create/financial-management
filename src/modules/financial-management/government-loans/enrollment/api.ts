import type { EnrollmentDetail, EnrollmentOutcome, EnrollmentPage, EnrollmentTerms, ExistingLoanForm, PriorLoan } from "./types";

const endpoint = "/api/fm/government-loans/loan-applications/enrollment";

export class EnrollmentApiError extends Error {
  constructor(message: string, readonly status: number, readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint + path, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new EnrollmentApiError(data?.message ?? "The enrollment service could not complete the request.", response.status, data?.fieldErrors);
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
export const enrollExisting = (form: ExistingLoanForm, key: string) => mutation("", { form }, key);
export const declineAgency = (record: EnrollmentDetail, reason: string, key: string) =>
  mutation("/" + record.id + "/decline", { reason, expectedRevision: record.request.revision }, key);
