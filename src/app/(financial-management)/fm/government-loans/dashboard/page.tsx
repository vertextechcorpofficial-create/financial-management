import { GovernmentLoansWorkspacePage } from "@/modules/financial-management/government-loans/components/GovernmentLoansWorkspacePage";
import { GOVERNMENT_LOANS_DASHBOARD } from "@/modules/financial-management/government-loans/workspaces";

export default function GovernmentLoansDashboardPage() {
  return <GovernmentLoansWorkspacePage workspace={GOVERNMENT_LOANS_DASHBOARD.key} />;
}
