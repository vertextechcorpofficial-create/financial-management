import { listPayrollInstructions } from "@/modules/financial-management/government-loans/server/payroll-handoff-store";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLoanRequestAccess("loans", () => listPayrollInstructions(new URL(request.url).searchParams));
}
