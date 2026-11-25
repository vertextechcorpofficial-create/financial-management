import { downloadAgencyStatement } from "@/modules/financial-management/government-loans/server/agency-statements";
import { requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, { params }: { params: Promise<{ id: string; statementId: string }> }) {
  return withLoanRequestAccess("loans", async () => {
    const { id, statementId } = await params;
    return downloadAgencyStatement(requestId(id), statementId);
  });
}
