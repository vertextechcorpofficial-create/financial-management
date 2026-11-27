import { bulkApproveRemittances } from "@/modules/financial-management/government-loans/server/remittance-approval";
import { LoanRequestError } from "@/modules/financial-management/government-loans/server/request-input";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return withLoanRequestAccess("remittance-approval", async actor => {
    const input = await request.json().catch(() => { throw new LoanRequestError(400, "Send the selected remittances as JSON."); });
    return bulkApproveRemittances(input, request.headers.get("Idempotency-Key"), actor);
  });
}
