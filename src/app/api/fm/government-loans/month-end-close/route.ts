import { closeGovernmentLoanMonth, viewMonthEndClose } from "@/modules/financial-management/government-loans/server/month-end-close";
import { exportMonthEndClose } from "@/modules/financial-management/government-loans/server/month-end-close-csv";
import { LoanRequestError } from "@/modules/financial-management/government-loans/server/request-input";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLoanRequestAccess("month-end-close", async actor => {
    const params = new URL(request.url).searchParams;
    const format = params.get("format");
    if (format === "checklist-csv" || format === "rollforward-csv") {
      return exportMonthEndClose(params.get("month"), format === "checklist-csv" ? "checklist" : "rollforward");
    }
    if (format) throw new LoanRequestError(422, "Choose a supported report format.");
    return { ...await viewMonthEndClose(params), workspaces: actor.workspaces };
  });
}

export function POST(request: Request) {
  return withLoanRequestAccess("month-end-close", async actor => {
    const body = await request.json().catch(() => { throw new LoanRequestError(400, "Send the close request as JSON."); });
    return closeGovernmentLoanMonth(body, request.headers.get("Idempotency-Key"), actor);
  });
}
