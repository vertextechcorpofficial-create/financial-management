import { GovernmentLoansWorkspacePage } from "@/modules/financial-management/government-loans/components/GovernmentLoansWorkspacePage";
import { GOVERNMENT_LOANS_LOAN_APPLICATIONS } from "@/modules/financial-management/government-loans/workspaces";

export default function GovernmentLoansLoanApplicationsPage() {
  return <GovernmentLoansWorkspacePage workspace={GOVERNMENT_LOANS_LOAN_APPLICATIONS.key} />;
}
