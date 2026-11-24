import { GovernmentLoansWorkspacePage } from "@/modules/financial-management/government-loans/components/GovernmentLoansWorkspacePage";
import { GOVERNMENT_LOANS_REMITTANCES } from "@/modules/financial-management/government-loans/workspaces";

export default function GovernmentLoansRemittancesPage() {
  return <GovernmentLoansWorkspacePage workspace={GOVERNMENT_LOANS_REMITTANCES.key} />;
}
