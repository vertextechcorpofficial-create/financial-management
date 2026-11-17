import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/treasury/loan-management/loan-register/components/PageShell";
import { LoanRegisterModule } from "@/modules/financial-management/treasury/loan-management/loan-register/LoanRegisterModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Loan Register",
};

export default function LoanRegisterPage() {
  return (
    <PageShell title="Loan Register">
      <LoanRegisterModule />
    </PageShell>
  );
}
