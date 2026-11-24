import { decideLoanApproval } from "@/modules/financial-management/government-loans/server/loan-approvals";
import { requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLoanRequestAccess("loan-approval", async actor => decideLoanApproval(
    requestId((await params).id), await request.json().catch(() => null), request.headers.get("Idempotency-Key"), actor,
  ));
}
