import { listRequestAgencies, listRequestEmployees } from "@/modules/financial-management/government-loans/server/request-assessment";
import { LoanRequestError } from "@/modules/financial-management/government-loans/server/request-input";
import { withRequestAccess } from "../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withRequestAccess(() => {
    const params = new URL(request.url).searchParams;
    const type = params.get("type");
    if (type === "employees") return listRequestEmployees(params);
    if (type === "agencies") return listRequestAgencies(params);
    throw new LoanRequestError(400, "Choose employees or agencies.");
  });
}
