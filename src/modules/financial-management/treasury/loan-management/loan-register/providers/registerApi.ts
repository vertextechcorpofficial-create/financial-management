import type { LoanListRow, RegisterSummary } from "../types";

const REQUEST_TIMEOUT_MS = 20000;

// A dropped connection must not leave the screen on skeletons forever.
function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}


export interface RegisterPayload {
  rows: LoanListRow[];
  total: number;
  summary: RegisterSummary;
}

export interface RegisterQuery {
  q: string;
  status: string;
  lenderType: string;
  page: number;
  pageSize: number;
}

function toQuery(query: RegisterQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status && query.status !== "ALL") params.set("status", query.status);
  if (query.lenderType && query.lenderType !== "ALL") params.set("lenderType", query.lenderType);
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  return params.toString();
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `The request failed (${response.status}).`;
  } catch {
    return `The request failed (${response.status}).`;
  }
}

export async function fetchRegister(query: RegisterQuery): Promise<RegisterPayload> {
  const response = await fetchWithTimeout(`/api/fm/treasury/loan-management/loan-register?${toQuery(query)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: RegisterPayload };
  return body.data;
}

export interface RegisterOptions {
  banks: Array<{ id: number; name: string }>;
}

export interface SchedulePreviewRow {
  id: number;
  period_no: number;
  due_date: string;
  /** The date the borrower actually pays, after weekend and holiday shifts. */
  payment_due_date: string;
  payment: number;
  principal: number;
  interest: number;
  closing_principal: number;
  status: string;
}

/** The dialog's installment table: one page of the version plus the calendar a shifted date moved off. */
export interface LoanSchedulePreview {
  rows: SchedulePreviewRow[];
  total: number;
  /** `loan_holiday` as date → name; `paymentShiftReason` turns a move into words with it. */
  holidays: Record<string, string>;
}

/** The detail dialog shows the installments, so it reads the schedule the Schedules screen reads. */
export async function fetchLoanSchedule(loanId: number, pageSize = 12): Promise<LoanSchedulePreview> {
  const response = await fetchWithTimeout(
    `/api/fm/treasury/loan-management/loan-schedules?loanId=${loanId}&page=1&pageSize=${pageSize}`,
    { headers: { accept: "application/json" } },
  );
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as {
    data: { rows: SchedulePreviewRow[]; total: number; holidays: Record<string, string> } | null;
  };
  return {
    rows: body.data?.rows ?? [],
    total: body.data?.total ?? 0,
    holidays: body.data?.holidays ?? {},
  };
}

export interface RefreshResult {
  asOf: string;
  scanned: number;
  updated: number;
  markedDue: number;
  markedOverdue: number;
  loansUpdated: number;
  loansOverdue: number;
  loansCurrent: number;
}

/**
 * The write that moves both the installment statuses and the loan status along with the calendar.
 * The register's badge is derived from the dates, so this is what keeps the stored columns honest.
 */
export async function refreshStatuses(): Promise<RefreshResult> {
  const response = await fetchWithTimeout("/api/fm/treasury/loan-management/loan-schedules/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: RefreshResult };
  return body.data;
}

export async function fetchOptions(): Promise<RegisterOptions> {
  const response = await fetchWithTimeout("/api/fm/treasury/loan-management/loan-register/options", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: RegisterOptions };
  return body.data;
}

export interface CreateLoanPayload {
  lenderName: string;
  lenderType: string;
  branch: string;
  accountOfficer: string;
  contactPhone: string;
  contactEmail: string;
  accountNo: string;
  purpose: string;
  security: string;
  securityValue: number | null;
  guarantor: string;
  principal: number;
  annualRate: number;
  rateType: string;
  repaymentMethod: string;
  paymentFrequency: string;
  termPayments: number;
  releaseDate: string;
  firstPaymentDate: string;
  firstPeriodBasis: string;
  businessDayRule: string;
  proceedsAccountId: number;
  processingFee: number;
  dstTreatment: string;
  otherCosts: number;
  penaltyRateMonthly: number;
  graceDays: number;
  pas23Applies: boolean;
  pas23BorrowingType: string | null;
  pas23Asset: string;
  pas23CapitalizeFrom: string;
  pas23CapitalizeUntil: string;
  remarks: string;
}

/** A 400 from the route, carrying the per-field messages the form has to paint. */
export class LoanFieldError extends Error {
  readonly fieldErrors: Record<string, string[]>;

  constructor(message: string, fieldErrors: Record<string, string[]>) {
    super(message);
    this.name = "LoanFieldError";
    this.fieldErrors = fieldErrors;
  }
}

export async function createLoan(payload: CreateLoanPayload): Promise<{ id: number; loanNo: string }> {
  const response = await fetchWithTimeout("/api/fm/treasury/loan-management/loan-register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      fieldErrors?: Record<string, string[]>;
    };
    const named = body.fieldErrors && Object.keys(body.fieldErrors).length > 0 ? body.fieldErrors : null;
    if (named) throw new LoanFieldError(body.error ?? "Some fields need attention.", named);
    throw new Error(body.error ?? `The loan could not be saved (${response.status}).`);
  }
  const body = (await response.json()) as { data: { id: number; loanNo: string } };
  return body.data;
}
