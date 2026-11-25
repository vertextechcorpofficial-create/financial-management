import { listApprovalAgencies, listRemittanceApproval } from "@/modules/financial-management/government-loans/server/remittance-approval";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLoanRequestAccess("remittance-approval", () => {
    const params = new URL(request.url).searchParams;
    return params.get("agencies") === "1" ? listApprovalAgencies() : listRemittanceApproval(params);
  });
}
