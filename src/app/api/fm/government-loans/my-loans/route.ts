import { listOwnLoans } from "@/modules/financial-management/government-loans/server/loan-reports";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return withLoanRequestAccess("my-loans", actor => listOwnLoans(actor.actorId));
}
