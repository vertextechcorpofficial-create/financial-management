import type { LoanListRow, RegisterSummary } from "../types";

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
  const response = await fetch(`/api/fm/treasury/loan-management/loan-register?${toQuery(query)}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data: RegisterPayload };
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

export async function createLoan(payload: CreateLoanPayload): Promise<{ id: number; loanNo: string }> {
  const response = await fetch("/api/fm/treasury/loan-management/loan-register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      fieldErrors?: Record<string, string[]>;
    };
    const first = body.fieldErrors ? Object.values(body.fieldErrors)[0]?.[0] : undefined;
    throw new Error(first ?? body.error ?? `The loan could not be saved (${response.status}).`);
  }
  const body = (await response.json()) as { data: { id: number; loanNo: string } };
  return body.data;
}
