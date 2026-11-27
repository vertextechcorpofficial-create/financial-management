import { GovernmentLoansWorkspacePage } from "@/modules/financial-management/government-loans/components/GovernmentLoansWorkspacePage";
import { GOVERNMENT_LOANS_LOANS } from "@/modules/financial-management/government-loans/workspaces";

export default async function GovernmentLoansLoansPage({ searchParams }: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  return <GovernmentLoansWorkspacePage workspace={GOVERNMENT_LOANS_LOANS.key} tab={(await searchParams).tab} />;
}
