import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/treasury/loan-management/loan-payments/components/PageShell";
import { PaymentsModule } from "@/modules/financial-management/treasury/loan-management/loan-payments/components/PaymentsModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Loan Payments",
};

export default async function LoanPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ loan?: string }>;
}) {
  const resolved = await searchParams;
  const loanParam = Number(resolved.loan);
  const initialLoanId = Number.isInteger(loanParam) && loanParam > 0 ? loanParam : null;
  return (
    <PageShell title="Loan Payments">
      <PaymentsModule initialLoanId={initialLoanId} />
    </PageShell>
  );
}
