import { GovernmentLoansWorkspacePage } from "@/modules/financial-management/government-loans/components/GovernmentLoansWorkspacePage";
import { GOVERNMENT_LOANS_REMITTANCES } from "@/modules/financial-management/government-loans/workspaces";

export default async function GovernmentLoansRemittancesPage({ searchParams }: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  return <GovernmentLoansWorkspacePage workspace={GOVERNMENT_LOANS_REMITTANCES.key} tab={(await searchParams).tab} />;
}
