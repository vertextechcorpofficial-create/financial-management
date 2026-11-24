import { GovernmentLoansWorkspacePage } from "@/modules/financial-management/government-loans/components/GovernmentLoansWorkspacePage";
import { GOVERNMENT_LOANS_LOAN_APPROVAL } from "@/modules/financial-management/government-loans/workspaces";

export default function GovernmentLoansLoanApprovalPage() {
  return <GovernmentLoansWorkspacePage workspace={GOVERNMENT_LOANS_LOAN_APPROVAL.key} />;
}
