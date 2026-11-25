import { listApprovalAgencies, listApprovalDecisions, listApprovalQueue } from "@/modules/financial-management/government-loans/server/loan-approvals";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return withLoanRequestAccess("loan-approval", async () => {
    if (params.get("view") === "decisions") return listApprovalDecisions(params);
    if (params.get("view") === "agencies") return listApprovalAgencies(params);
    return listApprovalQueue(params);
  });
}
