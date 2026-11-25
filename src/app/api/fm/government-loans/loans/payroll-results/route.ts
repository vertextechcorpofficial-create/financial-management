import { viewPayrollMonth } from "@/modules/financial-management/government-loans/server/payroll-month";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLoanRequestAccess("loans", () => viewPayrollMonth(new URL(request.url).searchParams));
}
