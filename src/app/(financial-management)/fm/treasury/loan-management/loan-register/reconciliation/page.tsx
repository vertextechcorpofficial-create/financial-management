import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/treasury/loan-management/loan-register/reconciliation/components/PageShell";
import { ReconciliationModule } from "@/modules/financial-management/treasury/loan-management/loan-register/reconciliation/components/ReconciliationModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Loan Reconciliation",
};

export default function LoanReconciliationPage() {
  return (
    <PageShell
      title="Loan Reconciliation"
      parent={{ label: "Loan Register", href: "/fm/treasury/loan-management/loan-register" }}
    >
      <ReconciliationModule />
    </PageShell>
  );
}
