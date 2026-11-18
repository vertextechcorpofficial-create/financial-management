import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/treasury/loan-management/loan-reconciliation/components/PageShell";
import { ReconciliationModule } from "@/modules/financial-management/treasury/loan-management/loan-reconciliation/components/ReconciliationModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Loan Reconciliation",
};

export default function LoanReconciliationPage() {
  return (
    <PageShell title="Loan Reconciliation">
      <ReconciliationModule />
    </PageShell>
  );
}
