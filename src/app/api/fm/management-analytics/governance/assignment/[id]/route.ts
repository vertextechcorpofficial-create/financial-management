import { currentUserId, handleRouteError, ok, toId } from "../../../_lib/http";
import { deleteAssignment } from "@/modules/financial-management/management-analytics/analytics-governance/services/governance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return ok(await deleteAssignment(toId(id), await currentUserId()));
  } catch (error) {
    return handleRouteError(error, "removing an access grant", "The access grant could not be removed.");
  }
}
