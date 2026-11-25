import { viewAgencyBilling } from "@/modules/financial-management/government-loans/server/agency-billing";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLoanRequestAccess("remittances", () => viewAgencyBilling(new URL(request.url).searchParams));
}
