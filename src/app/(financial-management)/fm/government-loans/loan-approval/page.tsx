import { GovernmentLoansWorkspacePage } from "@/modules/financial-management/government-loans/components/GovernmentLoansWorkspacePage";
import { GOVERNMENT_LOANS_LOAN_APPROVAL } from "@/modules/financial-management/government-loans/workspaces";

export default async function GovernmentLoansLoanApprovalPage({ searchParams }: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  return <GovernmentLoansWorkspacePage workspace={GOVERNMENT_LOANS_LOAN_APPROVAL.key} tab={(await searchParams).tab} />;
}
