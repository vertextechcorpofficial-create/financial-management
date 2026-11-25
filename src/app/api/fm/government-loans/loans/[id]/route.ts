import { getRegisterLoan } from "@/modules/financial-management/government-loans/server/loan-register";
import { requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLoanRequestAccess("loans", async () => getRegisterLoan(requestId((await params).id), new URL(request.url).searchParams));
}
