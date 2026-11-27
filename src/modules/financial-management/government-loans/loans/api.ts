import { RequestApiError } from "../requests/request-api";
import type { LoanRegisterPage, RegisterLoanDetail } from "./types";

export type RegisterTab = "register" | "agency-balances";
const endpoint = "/api/fm/government-loans/loans";

async function request(path: string, init?: RequestInit) {
  const response = await fetch(endpoint + path, { ...init, cache: "no-store" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new RequestApiError(data?.message ?? "The Loans request could not be completed.", response.status, data?.fieldErrors);
  }
  return response;
}

export async function listRegister(tab: RegisterTab, query: string, signal: AbortSignal): Promise<LoanRegisterPage> {
  return (await request("/" + tab + "?" + query, { signal })).json();
}

export async function copyRegisterCsv(tab: RegisterTab, query: string) {
  const params = new URLSearchParams(query);
  params.set("format", "csv");
  return (await request("/" + tab + "?" + params)).text();
}

export async function readRegisterDetail(id: number, page: number, signal: AbortSignal): Promise<RegisterLoanDetail> {
  return (await request("/" + id + "?page=" + page, { signal })).json();
}

export async function saveAgencyBalance(id: number, revision: number, key: string, form: FormData) {
  return (await request("/" + id + "/agency-statements", {
    method: "POST", body: form, headers: { "If-Match": String(revision), "Idempotency-Key": key },
  })).json();
}

export const agencyStatementDocumentUrl = (id: number, statementId: string) =>
  endpoint + "/" + id + "/agency-statements/" + encodeURIComponent(statementId) + "/document";
