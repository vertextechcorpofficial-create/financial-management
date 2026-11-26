import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/treasury/loan-management/loan-register/reconciliation/components/PageShell";
import { ReconciliationModule } from "@/modules/financial-management/treasury/loan-management/loan-register/reconciliation/components/ReconciliationModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Loan Reconciliation",
};

export default async function LoanReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; loanId?: string; loanNo?: string }>;
}) {
  const resolved = await searchParams;
  const loanId = Number(resolved.loanId);
  const fromPayments = resolved.from === "payments" && Number.isInteger(loanId) && loanId > 0;
  const parent = fromPayments
    ? {
        label: resolved.loanNo?.trim() || "Loan Payments",
        href: `/fm/treasury/loan-management/loan-payments?loan=${loanId}`,
      }
    : { label: "Loan Register", href: "/fm/treasury/loan-management/loan-register" };

  return (
    <PageShell title="Loan Reconciliation" parent={parent}>
      <ReconciliationModule />
    </PageShell>
  );
}
