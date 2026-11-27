import { currentUserId, handleRouteError, ok, toId } from "../../../_lib/http";
import { completeAction, deleteAction } from "@/modules/financial-management/management-analytics/analytics-review/services/review.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const actorId = await currentUserId();
    const action = await completeAction(toId(id), actorId);
    return ok(action);
  } catch (error) {
    return handleRouteError(error, "PATCH /review/action/[id]", "The action could not be closed.");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await deleteAction(toId(id));
    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error, "DELETE /review/action/[id]", "The action could not be deleted.");
  }
}
