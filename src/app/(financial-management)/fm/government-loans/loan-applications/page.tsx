import { GovernmentLoansWorkspacePage } from "@/modules/financial-management/government-loans/components/GovernmentLoansWorkspacePage";
import { GOVERNMENT_LOANS_LOAN_APPLICATIONS } from "@/modules/financial-management/government-loans/workspaces";

export default async function GovernmentLoansLoanApplicationsPage({ searchParams }: {
  searchParams: Promise<{ transferEmployee?: string | string[] }>;
}) {
  const { transferEmployee } = await searchParams;
  const id = typeof transferEmployee === "string" && /^[1-9]\d{0,9}$/.test(transferEmployee) ? Number(transferEmployee) : undefined;
  return <GovernmentLoansWorkspacePage workspace={GOVERNMENT_LOANS_LOAN_APPLICATIONS.key} transferEmployeeId={id} />;
}
