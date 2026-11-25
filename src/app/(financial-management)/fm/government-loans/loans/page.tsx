import { GovernmentLoansWorkspacePage } from "@/modules/financial-management/government-loans/components/GovernmentLoansWorkspacePage";
import { GOVERNMENT_LOANS_LOANS } from "@/modules/financial-management/government-loans/workspaces";

export default function GovernmentLoansLoansPage() {
  return <GovernmentLoansWorkspacePage workspace={GOVERNMENT_LOANS_LOANS.key} />;
}
