import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/management-analytics/analytics-variance/components/PageShell";
import { VarianceModule } from "@/modules/financial-management/management-analytics/analytics-variance/components/VarianceModule";
import { AnalyticsShell } from "@/modules/financial-management/management-analytics/analytics-variance/components/AnalyticsShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Variance Protocol",
};

export default function VariancePage() {
  return (
    <PageShell title="Variance Protocol">
      <AnalyticsShell>
        <VarianceModule />
      </AnalyticsShell>
    </PageShell>
  );
}
