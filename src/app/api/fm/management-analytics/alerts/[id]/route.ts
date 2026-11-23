import { currentUserId, fail, handleRouteError, ok, toId } from "../../_lib/http";
import { setAlertState } from "@/modules/financial-management/management-analytics/analytics-alerts/services/alerts.service";
import type { AlertState } from "@/modules/financial-management/management-analytics/analytics-alerts/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATES: AlertState[] = ["UNREAD", "READ", "ACKED"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { state?: string } | null;
    const state = body?.state;
    if (!state || !STATES.includes(state as AlertState)) {
      return fail("Send a state of UNREAD, READ or ACKED.", 400);
    }
    const actorId = await currentUserId();
    return ok(await setAlertState(toId(id), state as AlertState, actorId));
  } catch (error) {
    return handleRouteError(error, "alerts/[id]", "The alert could not be updated.");
  }
}
