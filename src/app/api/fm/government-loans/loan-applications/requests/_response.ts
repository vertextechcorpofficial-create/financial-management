import type { AgencyActor } from "@/modules/financial-management/government-loans/server/agencies";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export function withRequestAccess(handler: (actor: AgencyActor) => Promise<unknown>, status = 200) {
  return withLoanRequestAccess("loan-applications", handler, status);
}
