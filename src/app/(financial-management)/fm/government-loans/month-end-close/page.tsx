import { GovernmentLoansWorkspacePage } from "@/modules/financial-management/government-loans/components/GovernmentLoansWorkspacePage";
import { GOVERNMENT_LOANS_MONTH_END_CLOSE } from "@/modules/financial-management/government-loans/workspaces";

export default function GovernmentLoansMonthEndClosePage() {
  return <GovernmentLoansWorkspacePage workspace={GOVERNMENT_LOANS_MONTH_END_CLOSE.key} />;
}
