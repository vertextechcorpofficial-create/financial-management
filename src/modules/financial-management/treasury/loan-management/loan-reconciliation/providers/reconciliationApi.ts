import type {
  LoanOption,
  ReconciliationRow,
  RollForward,
  StatementRow,
  StatementVariance,
} from "../types";

const BASE = "/api/fm/treasury/loan-management/loan-reconciliation";

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: string;
      fieldErrors?: Record<string, string[]>;
    };
    const firstField = body.fieldErrors ? Object.values(body.fieldErrors)[0]?.[0] : undefined;
    if (firstField) return firstField;
    if (body.error) return body.error;
  } catch {
    // fall through to the status sentence
  }
  return `The request failed (${response.status}).`;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { success: boolean; data: T };
  return body.data;
}

async function sendJson<T>(path: string, method: "POST", payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { success: boolean; data: T };
  return body.data;
}

export type ReconciliationContext = {
  loans: LoanOption[];
  lockedThrough: string | null;
  lockNote: string | null;
  today: string;
  defaultPeriod: { periodStart: string; periodEnd: string };
};

export function fetchContext(): Promise<ReconciliationContext> {
  return getJson<ReconciliationContext>(`${BASE}/context`);
}

export function fetchRollForward(input: { periodStart: string; periodEnd: string }): Promise<RollForward> {
  const query = new URLSearchParams({
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });
  return getJson<RollForward>(`${BASE}/build?${query.toString()}`);
}

export type ReconciliationPage = {
  rows: ReconciliationRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function fetchReconciliations(input: {
  result?: string;
  page: number;
  pageSize: number;
}): Promise<ReconciliationPage> {
  const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
  if (input.result && input.result !== "ALL") query.set("result", input.result);
  return getJson<ReconciliationPage>(`${BASE}?${query.toString()}`);
}

export function saveRollForward(input: {
  periodStart: string;
  periodEnd: string;
  remarks?: string;
}): Promise<ReconciliationRow> {
  return sendJson<ReconciliationRow>(BASE, "POST", input);
}

export function signOffReconciliation(id: number, remarks?: string): Promise<ReconciliationRow> {
  return sendJson<ReconciliationRow>(`${BASE}/${id}/sign-off`, "POST", { remarks: remarks ?? "" });
}

export type StatementPage = {
  rows: StatementRow[];
  total: number;
  page: number;
  pageSize: number;
};

export function fetchStatements(input: {
  result?: string;
  loanId?: number | null;
  page: number;
  pageSize: number;
}): Promise<StatementPage> {
  const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
  if (input.result && input.result !== "ALL") query.set("result", input.result);
  if (input.loanId) query.set("loanId", String(input.loanId));
  return getJson<StatementPage>(`${BASE}/statements?${query.toString()}`);
}

export type RecordedStatement = {
  row: StatementRow;
  variances: StatementVariance[];
  result: "AGREES" | "DIFFERS";
  sentence: string;
};

export function recordStatement(input: {
  loanId: number;
  statementDate: string;
  lenderPrincipal: number;
  lenderInterest: number;
  lenderPenalties: number;
  lenderAdvances: number;
  remarks?: string;
}): Promise<RecordedStatement> {
  return sendJson<RecordedStatement>(`${BASE}/statements`, "POST", input);
}
