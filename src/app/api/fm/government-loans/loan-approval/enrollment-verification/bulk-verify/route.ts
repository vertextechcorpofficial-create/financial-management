import { bulkVerifyEnrollments } from "@/modules/financial-management/government-loans/server/loan-verification";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return withLoanRequestAccess("loan-approval", async actor => bulkVerifyEnrollments(
    await request.json().catch(() => null), request.headers.get("Idempotency-Key"), actor,
  ));
}
