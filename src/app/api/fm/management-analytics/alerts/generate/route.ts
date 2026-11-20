import { currentUserId, handleRouteError, ok } from "../../_lib/http";
import { generateAlerts } from "@/modules/financial-management/management-analytics/analytics-alerts/services/alerts.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const actorId = await currentUserId();
    return ok(await generateAlerts(actorId));
  } catch (error) {
    return handleRouteError(error, "alerts/generate", "The alert sweep could not run.");
  }
}
