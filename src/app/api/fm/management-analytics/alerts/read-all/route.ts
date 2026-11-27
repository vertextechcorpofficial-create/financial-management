import { currentUserId, handleRouteError, ok } from "../../_lib/http";
import { markAllAlertsRead } from "@/modules/financial-management/management-analytics/analytics-alerts/services/alerts.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const actorId = await currentUserId();
    return ok(await markAllAlertsRead(actorId));
  } catch (error) {
    return handleRouteError(error, "alerts/read-all", "Unread alerts could not be marked read.");
  }
}
