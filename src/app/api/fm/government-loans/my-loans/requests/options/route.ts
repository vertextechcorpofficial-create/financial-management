import { listRequestAgencies, listRequestEmployees } from "@/modules/financial-management/government-loans/server/request-assessment";
import { LoanRequestError } from "@/modules/financial-management/government-loans/server/request-input";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLoanRequestAccess("my-loans", async actor => {
    const params = new URL(request.url).searchParams;
    if (params.get("type") === "agencies") return listRequestAgencies(params);
    if (params.get("type") === "co-makers") {
      params.set("exclude", String(actor.actorId));
      return listRequestEmployees(params);
    }
    throw new LoanRequestError(400, "Choose agencies or co-makers.");
  });
}
