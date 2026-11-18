import type { Metadata } from "next";

import { JournalModule } from "@/modules/financial-management/treasury/loan-management/loan-register/journal/components/JournalModule";
import { PageShell } from "@/modules/financial-management/treasury/loan-management/loan-register/journal/components/PageShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Loan Journal",
};

export default function LoanJournalPage() {
  return (
    <PageShell
      title="Loan Journal"
      parent={{ label: "Loan Register", href: "/fm/treasury/loan-management/loan-register" }}
    >
      <JournalModule />
    </PageShell>
  );
}
