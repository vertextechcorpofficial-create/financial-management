import { downloadPayrollAcknowledgement, importPayrollAcknowledgements } from "@/modules/financial-management/government-loans/server/payroll-file-exchange";
import { requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLoanRequestAccess("loan-approval", async actor => importPayrollAcknowledgements(requestId((await params).id), request, actor));
}

export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLoanRequestAccess("loan-approval", async () => downloadPayrollAcknowledgement(
    requestId((await params).id), new URL(request.url).searchParams.get("revision"),
  ));
}
