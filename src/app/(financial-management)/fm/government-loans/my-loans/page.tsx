import { GovernmentLoansWorkspacePage } from "@/modules/financial-management/government-loans/components/GovernmentLoansWorkspacePage";
import { GOVERNMENT_LOANS_MY_LOANS } from "@/modules/financial-management/government-loans/workspaces";

export default function GovernmentLoansMyLoansPage() {
  return <GovernmentLoansWorkspacePage workspace={GOVERNMENT_LOANS_MY_LOANS.key} />;
}
