import { exportYearEnd, reportYearEnd } from "@/modules/financial-management/government-loans/server/year-end-report";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return withLoanRequestAccess("reports", () => params.get("format") === "csv" ? exportYearEnd(params) :
    reportYearEnd(params));
}
