import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/management-analytics/analytics-tiers/components/PageShell";
import { TiersModule } from "@/modules/financial-management/management-analytics/analytics-tiers/components/TiersModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "KPI Catalogue" };

export default function Page() {
  return (
    <PageShell title="KPI Catalogue">
      <TiersModule />
    </PageShell>
  );
}
