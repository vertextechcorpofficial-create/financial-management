import "server-only";

export const GOVERNMENT_LOAN_AGENCIES = "government_loan_agencies";
export const GOVERNMENT_LOAN_AGENCY_HISTORY = "government_loan_agency_history";
export const GOVERNMENT_LOAN_REQUESTS = "government_loan_requests";
export const GOVERNMENT_LOAN_REQUEST_HISTORY = "government_loan_request_history";
export const GOVERNMENT_LOAN_REQUEST_DOCUMENTS = "government_loan_request_documents";
export const GOVERNMENT_LOAN_SETTINGS = "government_loan_settings";
export const GOVERNMENT_LOAN_IMPORT_BATCHES = "government_loan_import_batches";
export const GOVERNMENT_LOAN_PAYROLL_HANDOFFS = "government_loan_payroll_handoffs";
export const GOVERNMENT_LOAN_AGENCY_STATEMENTS = "government_loan_agency_statements";
export const GOVERNMENT_LOAN_PAYROLL_RECEIPTS = "government_loan_payroll_receipts";
export const GOVERNMENT_LOAN_PAYROLL_RESULTS = "government_loan_payroll_results";
export const GOVERNMENT_LOAN_PERIOD_COMMANDS = "government_loan_period_commands";
export const GOVERNMENT_LOAN_CHANGE_INSTRUCTIONS = "government_loan_change_instructions";
export const GOVERNMENT_LOAN_STAFF_EVENTS = "government_loan_staff_events";
export const GOVERNMENT_LOAN_BILLING_REVISIONS = "government_loan_billing_revisions";
export const GOVERNMENT_LOAN_REMITTANCE_BATCHES = "government_loan_remittance_batches";
export const GOVERNMENT_LOAN_REMITTANCES = "government_loan_remittances";
export const GOVERNMENT_LOAN_REMITTANCE_DECISIONS = "government_loan_remittance_decisions";
export const GOVERNMENT_LOAN_CLOSES = "government_loan_month_closes";
export const GOVERNMENT_LOAN_SETUP_EVENTS = "government_loan_setup_events";

export type GovernmentLoansCollection = "user" | "modules" | "user_access_modules" | "benefit_loans"
  | "department" | "employment_status" | "user_wage_management" | "cutoff_settings"
  | "payroll_run" | "payroll_run_employee" | "payroll_run_employee_item"
  | typeof GOVERNMENT_LOAN_AGENCIES | typeof GOVERNMENT_LOAN_AGENCY_HISTORY
  | typeof GOVERNMENT_LOAN_REQUESTS | typeof GOVERNMENT_LOAN_REQUEST_HISTORY | typeof GOVERNMENT_LOAN_REQUEST_DOCUMENTS
  | typeof GOVERNMENT_LOAN_SETTINGS | typeof GOVERNMENT_LOAN_IMPORT_BATCHES | typeof GOVERNMENT_LOAN_PAYROLL_HANDOFFS
  | typeof GOVERNMENT_LOAN_AGENCY_STATEMENTS | typeof GOVERNMENT_LOAN_PAYROLL_RECEIPTS | typeof GOVERNMENT_LOAN_PAYROLL_RESULTS
  | typeof GOVERNMENT_LOAN_PERIOD_COMMANDS | typeof GOVERNMENT_LOAN_CHANGE_INSTRUCTIONS | typeof GOVERNMENT_LOAN_STAFF_EVENTS
  | typeof GOVERNMENT_LOAN_BILLING_REVISIONS | typeof GOVERNMENT_LOAN_REMITTANCE_BATCHES | typeof GOVERNMENT_LOAN_REMITTANCES
  | typeof GOVERNMENT_LOAN_REMITTANCE_DECISIONS | typeof GOVERNMENT_LOAN_CLOSES
  | typeof GOVERNMENT_LOAN_SETUP_EVENTS;

export class GovernmentLoansDirectusError extends Error {
  constructor(readonly status: number, readonly code?: string, readonly source?: string) {
    super("The Government Loans data service could not complete the request.");
  }
}

export async function governmentLoansDirectus(path: string, init: RequestInit = {}, timeout = 10_000) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "");
  const token = process.env.DIRECTUS_STATIC_TOKEN?.trim();
  if (!base || !token) throw new GovernmentLoansDirectusError(503);

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const source = path.split("?")[0];
  const started = performance.now();
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(timeout),
  }).catch(error => {
    throw new GovernmentLoansDirectusError(503, error instanceof Error ? error.name : "FETCH_FAILED", source);
  });
  if (process.env.GL_PROFILE === "1") {
    console.info("[gl]", init.method ?? "GET", source, Math.round(performance.now() - started) + "ms");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const code = error?.errors?.[0]?.extensions?.code;
    throw new GovernmentLoansDirectusError(response.status, typeof code === "string" ? code : undefined, source);
  }
  return response;
}

export async function readGovernmentLoansItems(collection: GovernmentLoansCollection, query: URLSearchParams) {
  return (await governmentLoansDirectus(`/items/${collection}?${query}`, { headers: { Accept: "application/json" } })).json();
}

export async function writeGovernmentLoansItem(collection: GovernmentLoansCollection, body: object, fields: string, id?: number, timeout?: number) {
  const path = id === undefined ? collection : `${collection}/${id}`;
  const response = await governmentLoansDirectus(`/items/${path}?${new URLSearchParams({ fields })}`, {
    method: id === undefined ? "POST" : "PATCH",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeout);
  return response.json();
}

export function writeGovernmentLoanAgency(body: object, fields: string, id?: number) {
  return writeGovernmentLoansItem(GOVERNMENT_LOAN_AGENCIES, body, fields, id);
}
