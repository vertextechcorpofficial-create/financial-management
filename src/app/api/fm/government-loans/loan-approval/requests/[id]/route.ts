import { getApprovalReview } from "@/modules/financial-management/government-loans/server/loan-approvals";
import { requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLoanRequestAccess("loan-approval", async () => getApprovalReview(requestId((await params).id)));
}
