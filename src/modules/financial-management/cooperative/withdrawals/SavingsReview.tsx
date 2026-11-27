import { Kv } from "../console/components/ui";
import { peso } from "../members/format";
import type { WithdrawalFilingReview } from "../server/withdrawals";

export const withdrawalMethodLabel = { CASH: "Cash at the Cooperative office", PAYROLL: "Payroll bank account" } as const;

export function SavingsReview({ balance, annualUsage, projectedSavings }: Pick<
  WithdrawalFilingReview, "balance" | "annualUsage" | "projectedSavings"
>) {
  const reviewingPayout = projectedSavings !== null;
  return <Kv rows={[
    ["Posted savings", peso(balance.postedSavings)],
    ["Maintaining balance", peso(balance.maintainingBalance)],
    [reviewingPayout ? "Other pending reservations" : "Pending reservations", peso(balance.pendingAmount)],
    ["Available savings", balance.availableSavings === null ? "—" : peso(balance.availableSavings)],
    ...(reviewingPayout ? [["Projected savings after release", peso(projectedSavings), "total"]] as [string, string, "total"][] : []),
    [`Withdrawals used in ${annualUsage.year}`, annualUsage.limit ? `${annualUsage.used} of ${annualUsage.limit}` : `${annualUsage.used} · Unlimited`],
  ]} />;
}
