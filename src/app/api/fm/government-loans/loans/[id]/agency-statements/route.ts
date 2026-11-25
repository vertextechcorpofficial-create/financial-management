import { recordAgencyStatement } from "@/modules/financial-management/government-loans/server/agency-statements";
import { requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLoanRequestAccess("loans", async actor => recordAgencyStatement(requestId((await params).id), request, actor));
}
