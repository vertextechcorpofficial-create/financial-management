import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/treasury/loan-management/loan-settings/components/PageShell";
import { SettingsModule } from "@/modules/financial-management/treasury/loan-management/loan-settings/components/SettingsModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Loan Settings",
};

export default function LoanSettingsPage() {
  return (
    <PageShell title="Loan Settings">
      <SettingsModule />
    </PageShell>
  );
}
