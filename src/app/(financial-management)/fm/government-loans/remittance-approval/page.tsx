import { GovernmentLoansWorkspacePage } from "@/modules/financial-management/government-loans/components/GovernmentLoansWorkspacePage";
import { GOVERNMENT_LOANS_REMITTANCE_APPROVAL } from "@/modules/financial-management/government-loans/workspaces";

export default function GovernmentLoansRemittanceApprovalPage() {
  return <GovernmentLoansWorkspacePage workspace={GOVERNMENT_LOANS_REMITTANCE_APPROVAL.key} />;
}
