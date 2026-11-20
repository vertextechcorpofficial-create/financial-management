import type { Metadata } from "next";
import { PageShell } from "@/modules/financial-management/management-analytics/analytics-cadence/components/PageShell";
import { CadenceModule } from "@/modules/financial-management/management-analytics/analytics-cadence/components/CadenceModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reporting Cadence" };

export default function Page() {
  return (
    <PageShell title="Reporting Cadence">
      <CadenceModule />
    </PageShell>
  );
}
