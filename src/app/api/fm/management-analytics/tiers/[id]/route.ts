import { handleRouteError, ok } from "../../_lib/http";
import { loadCatalogDetail } from "@/modules/financial-management/management-analytics/analytics-tiers/services/catalog.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const kpiId = Number(id);
    if (!Number.isInteger(kpiId) || kpiId <= 0) {
      return ok(null);
    }
    const detail = await loadCatalogDetail(kpiId);
    return ok(detail);
  } catch (error) {
    return handleRouteError(error, "tiers", "The KPI could not be read.");
  }
}
