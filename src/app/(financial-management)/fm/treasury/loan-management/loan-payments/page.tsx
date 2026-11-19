import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/treasury/loan-management/loan-payments/components/PageShell";
import { PaymentsModule } from "@/modules/financial-management/treasury/loan-management/loan-payments/components/PaymentsModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Loan Payments",
};

export default function LoanPaymentsPage() {
  return (
    <PageShell title="Loan Payments">
      <PaymentsModule />
    </PageShell>
  );
}
