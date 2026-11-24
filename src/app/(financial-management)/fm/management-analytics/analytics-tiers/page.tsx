import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/management-analytics/analytics-tiers/components/PageShell";
import { TiersModule } from "@/modules/financial-management/management-analytics/analytics-tiers/components/TiersModule";
import { AnalyticsShell } from "@/modules/financial-management/management-analytics/shared/AnalyticsShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "KPI Catalogue" };

export default function Page() {
  return (
    <PageShell title="KPI Catalogue">
      <AnalyticsShell>
        <TiersModule />
      </AnalyticsShell>
    </PageShell>
  );
}
