import { reportEmployeeLedger, reportLedgerLoan } from "@/modules/financial-management/government-loans/server/loan-reports";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return withLoanRequestAccess("reports", () => params.has("loanId") ? reportLedgerLoan(params) : reportEmployeeLedger(params));
}
