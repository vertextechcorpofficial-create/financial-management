import type { Metadata } from "next";

import { ChangesModule } from "@/modules/financial-management/treasury/loan-management/loan-changes/components/ChangesModule";
import { PageShell } from "@/modules/financial-management/treasury/loan-management/loan-changes/components/PageShell";

export const metadata: Metadata = {
  title: "Prepayments and Changes",
};

export default async function LoanChangesPage() {
  return (
    <PageShell title="Prepayments and Changes">
      <ChangesModule />
    </PageShell>
  );
}
