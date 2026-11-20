import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/management-analytics/analytics-overview/components/PageShell";
import { OverviewModule } from "@/modules/financial-management/management-analytics/analytics-overview/components/OverviewModule";
import { PAGE_SIZE } from "@/modules/financial-management/management-analytics/analytics-overview/constants";
import { loadOverview } from "@/modules/financial-management/management-analytics/analytics-overview/services/overview.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Group Overview" };

interface PageProps {
  searchParams: Promise<{ company?: string; period?: string; page?: string; size?: string; status?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const payload = await loadOverview({ company: params.company, asOf: params.period });
  const page = Number(params.page ?? "1");
  const size = Number(params.size ?? String(PAGE_SIZE));

  return (
    <PageShell title="Group Overview">
      <OverviewModule
        payload={payload}
        page={Number.isFinite(page) && page > 0 ? page : 1}
        pageSize={Number.isFinite(size) && size > 0 ? size : PAGE_SIZE}
        basePath="/fm/management-analytics/analytics-overview"
        status={params.status}
        company={params.company}
      />
    </PageShell>
  );
}
