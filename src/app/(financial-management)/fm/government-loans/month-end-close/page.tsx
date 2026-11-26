import { GovernmentLoansWorkspacePage } from "@/modules/financial-management/government-loans/components/GovernmentLoansWorkspacePage";
import { readOpenMonth } from "@/modules/financial-management/government-loans/server/period-commands";
import { GOVERNMENT_LOANS_MONTH_END_CLOSE } from "@/modules/financial-management/government-loans/workspaces";

export default async function GovernmentLoansMonthEndClosePage({ searchParams }: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ tab }, openMonth] = await Promise.all([
    searchParams,
    readOpenMonth().catch(() => null),
  ]);
  return <GovernmentLoansWorkspacePage workspace={GOVERNMENT_LOANS_MONTH_END_CLOSE.key} tab={tab}
    defaultTab={openMonth ? undefined : "setup"} />;
}
