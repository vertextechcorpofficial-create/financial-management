import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/management-analytics/analytics-data/components/PageShell";
import { DataModule } from "@/modules/financial-management/management-analytics/analytics-data/components/DataModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Data Life Cycle",
};

export default function AnalyticsDataPage() {
  return (
    <PageShell title="Data Life Cycle">
      <DataModule />
    </PageShell>
  );
}
