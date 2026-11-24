import { GovernmentLoansWorkspacePage } from "@/modules/financial-management/government-loans/components/GovernmentLoansWorkspacePage";
import { GOVERNMENT_LOANS_REPORTS } from "@/modules/financial-management/government-loans/workspaces";

export default function GovernmentLoansReportsPage() {
  return <GovernmentLoansWorkspacePage workspace={GOVERNMENT_LOANS_REPORTS.key} />;
}
