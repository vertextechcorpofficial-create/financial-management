import { listEnrollmentVerification } from "@/modules/financial-management/government-loans/server/loan-verification";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLoanRequestAccess("loan-approval", () => listEnrollmentVerification(new URL(request.url).searchParams));
}
