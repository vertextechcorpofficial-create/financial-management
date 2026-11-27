import type { Metadata } from "next";
import { PageShell } from "@/modules/financial-management/management-analytics/analytics-scenario/components/PageShell";
import { ScenarioModule } from "@/modules/financial-management/management-analytics/analytics-scenario/components/ScenarioModule";
import { AnalyticsShell } from "@/modules/financial-management/management-analytics/analytics-scenario/components/AnalyticsShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Scenario Planner" };

export default function ScenarioPage() {
  return (
    <PageShell title="Scenario Planner">
      <AnalyticsShell>
        <ScenarioModule />
      </AnalyticsShell>
    </PageShell>
  );
}
