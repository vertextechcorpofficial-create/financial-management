import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/management-analytics/analytics-governance/components/PageShell";
import { GovernanceModule } from "@/modules/financial-management/management-analytics/analytics-governance/components/GovernanceModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Access and Governance" };

export default function Page() {
  return (
    <PageShell title="Access and Governance">
      <GovernanceModule />
    </PageShell>
  );
}
