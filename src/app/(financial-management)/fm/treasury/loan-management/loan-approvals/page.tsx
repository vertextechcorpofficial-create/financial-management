import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/treasury/loan-management/loan-approvals/components/PageShell";
import { LoanApprovalsModule } from "@/modules/financial-management/treasury/loan-management/loan-approvals/LoanApprovalsModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Loan Approvals",
};

export default function LoanApprovalsPage() {
  return (
    <PageShell title="Loan Approvals">
      <LoanApprovalsModule />
    </PageShell>
  );
}
