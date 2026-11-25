import { readLoanDashboard } from "@/modules/financial-management/government-loans/server/dashboard";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return withLoanRequestAccess("dashboard", actor => readLoanDashboard(actor.workspaces.map(workspace => workspace.key)));
}
