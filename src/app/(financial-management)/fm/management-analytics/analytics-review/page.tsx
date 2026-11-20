import type { Metadata } from "next";

import { PageShell } from "@/modules/financial-management/management-analytics/analytics-review/components/PageShell";
import { ReviewModule } from "@/modules/financial-management/management-analytics/analytics-review/components/ReviewModule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Monthly Review",
};

export default function ReviewPage() {
  return (
    <PageShell title="Monthly Review">
      <ReviewModule />
    </PageShell>
  );
}
