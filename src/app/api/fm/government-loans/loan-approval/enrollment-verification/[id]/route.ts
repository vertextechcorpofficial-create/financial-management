import { requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { getEnrollmentVerification } from "@/modules/financial-management/government-loans/server/loan-verification";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLoanRequestAccess("loan-approval", async actor => getEnrollmentVerification(requestId((await params).id), actor));
}
