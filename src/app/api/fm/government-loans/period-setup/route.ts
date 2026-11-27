import { readPeriodSetup, runPeriodSetup } from "@/modules/financial-management/government-loans/server/period-setup";
import { LoanRequestError } from "@/modules/financial-management/government-loans/server/request-input";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return withLoanRequestAccess("month-end-close", () => readPeriodSetup());
}

export function POST(request: Request) {
  return withLoanRequestAccess("month-end-close", async actor => {
    const body = await request.json().catch(() => {
      throw new LoanRequestError(400, "Send the setup request as JSON.");
    });
    return runPeriodSetup(body, request.headers.get("Idempotency-Key"), actor);
  });
}
