import type { Metadata } from "next";
import { cookies } from "next/headers";

import { PageShell } from "@/modules/financial-management/management-analytics/analytics-overview/components/PageShell";
import { OverviewModule } from "@/modules/financial-management/management-analytics/analytics-overview/components/OverviewModule";
import { PAGE_SIZE } from "@/modules/financial-management/management-analytics/analytics-overview/constants";
import { loadOverview } from "@/modules/financial-management/management-analytics/analytics-overview/services/overview.service";
import { AnalyticsShell } from "@/modules/financial-management/management-analytics/analytics-overview/components/AnalyticsShell";
import { ReadFailure } from "@/modules/financial-management/management-analytics/analytics-overview/components/BoardKit";
import { MA_FILTERS_COOKIE } from "@/modules/financial-management/management-analytics/analytics-overview/components/analytics-screens";
import type { OverviewPayload } from "@/modules/financial-management/management-analytics/analytics-overview/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Group Overview" };

interface PageProps {
  searchParams: Promise<{ company?: string; period?: string; page?: string; size?: string; status?: string }>;
}

async function readServerFilters(): Promise<{ company?: string; period?: string }> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(MA_FILTERS_COOKIE)?.value;
    if (!raw) return {};
    const parsed = JSON.parse(decodeURIComponent(raw)) as { company?: string; period?: string };
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const saved = await readServerFilters();

  let payload: OverviewPayload | null = null;
  let failure: string | null = null;
  try {
    payload = await loadOverview({
      company: params.company ?? saved.company,
      asOf: params.period ?? saved.period,
    });
  } catch (error) {
    failure = error instanceof Error ? error.message : "The overview read failed without a message.";
  }

  if (!payload) {
    return (
      <PageShell title="Group Overview">
        <AnalyticsShell>
          <ReadFailure title="Group Overview" reason={failure ?? "The overview read returned nothing."} />
        </AnalyticsShell>
      </PageShell>
    );
  }

  const size = Number(params.size ?? String(PAGE_SIZE));

  return (
    <PageShell title="Group Overview">
      <AnalyticsShell>
        <OverviewModule
          payload={payload}
          pageSize={Number.isFinite(size) && size > 0 ? size : PAGE_SIZE}
          basePath="/fm/management-analytics/analytics-overview"
          status={params.status}
        />
      </AnalyticsShell>
    </PageShell>
  );
}
