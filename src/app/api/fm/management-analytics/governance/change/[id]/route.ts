import { currentUserId, handleRouteError, ok, toId } from "../../../_lib/http";
import { decideChange } from "@/modules/financial-management/management-analytics/analytics-governance/services/governance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  status?: string;
  note?: string;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Body;
    const result = await decideChange(toId(id), String(body.status ?? ""), body.note ? String(body.note) : null, await currentUserId());
    return ok(result);
  } catch (error) {
    return handleRouteError(error, "recording a decision", "The decision could not be saved.");
  }
}
