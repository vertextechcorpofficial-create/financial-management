import { confirmPayrollReceipt, previewPayrollReceipt } from "@/modules/financial-management/government-loans/server/payroll-month";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLoanRequestAccess("loans", () => previewPayrollReceipt(new URL(request.url).searchParams.get("month")));
}

export function POST(request: Request) {
  return withLoanRequestAccess("loans", async actor => confirmPayrollReceipt(
    await request.json().catch(() => null), request.headers.get("Idempotency-Key"), actor,
  ));
}
