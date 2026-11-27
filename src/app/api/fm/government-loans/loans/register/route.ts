import { listLoanRegister } from "@/modules/financial-management/government-loans/server/loan-register";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLoanRequestAccess("loans", () => listLoanRegister(new URL(request.url).searchParams));
}
