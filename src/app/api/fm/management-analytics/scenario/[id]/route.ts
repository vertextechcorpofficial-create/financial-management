import { NextRequest } from "next/server";
import { currentUserId, handleRouteError, ok, toId } from "../../_lib/http";
import { activateScenario, deleteScenario } from "@/modules/financial-management/management-analytics/analytics-scenario/services/scenario.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const actorId = await currentUserId();
    return ok(await activateScenario(toId(id), actorId));
  } catch (error) {
    return handleRouteError(error, "scenario PATCH", "The scenario could not be activated.");
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await deleteScenario(toId(id));
    return ok({ id: toId(id) });
  } catch (error) {
    return handleRouteError(error, "scenario DELETE", "The scenario could not be removed.");
  }
}
