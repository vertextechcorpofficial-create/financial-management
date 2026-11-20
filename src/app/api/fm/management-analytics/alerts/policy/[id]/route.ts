import { currentUserId, fail, handleRouteError, ok, toId } from "../../../_lib/http";
import { setAlertPolicy } from "@/modules/financial-management/management-analytics/analytics-alerts/services/alerts.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { isEnabled?: unknown; channel?: unknown } | null;
    if (!body || (typeof body.isEnabled !== "boolean" && typeof body.channel !== "string")) {
      return fail("Send isEnabled or channel.", 400);
    }
    const actorId = await currentUserId();
    return ok(
      await setAlertPolicy(
        toId(id),
        {
          isEnabled: typeof body.isEnabled === "boolean" ? body.isEnabled : undefined,
          channel: typeof body.channel === "string" ? body.channel : undefined,
        },
        actorId,
      ),
    );
  } catch (error) {
    return handleRouteError(error, "alerts/policy/[id]", "The delivery rule could not be saved.");
  }
}
