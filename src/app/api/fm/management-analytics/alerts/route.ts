import { handleRouteError, ok } from "../_lib/http";
import { loadAlerts } from "@/modules/financial-management/management-analytics/analytics-alerts/services/alerts.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return ok(
      await loadAlerts({
        state: url.searchParams.get("state") ?? undefined,
        type: url.searchParams.get("type") ?? undefined,
        page: Number(url.searchParams.get("page") ?? 1) || 1,
        size: Number(url.searchParams.get("size") ?? 10) || 10,
      }),
    );
  } catch (error) {
    return handleRouteError(error, "alerts", "The alerts could not be read.");
  }
}
