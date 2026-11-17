import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/treasury/loan-management/loan-schedules/components/PageShell";
import { SchedulesModule } from "@/modules/financial-management/treasury/loan-management/loan-schedules/components/SchedulesModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Loan Schedules",
};

export default async function LoanSchedulesPage() {
  return (
    <PageShell title="Loan Schedules">
      <SchedulesModule />
    </PageShell>
  );
}
