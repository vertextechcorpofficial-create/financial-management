import type { Metadata } from "next";
import { PageShell } from "@/modules/financial-management/management-analytics/analytics-alerts/components/PageShell";
import { AlertsModule } from "@/modules/financial-management/management-analytics/analytics-alerts/components/AlertsModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Alerts and Policy" };

export default function Page() {
  return (
    <PageShell title="Alerts and Policy">
      <AlertsModule />
    </PageShell>
  );
}
