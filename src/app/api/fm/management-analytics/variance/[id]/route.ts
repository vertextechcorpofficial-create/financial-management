import { handleRouteError, ok, toId } from "../../_lib/http";
import { loadDetail } from "@/modules/financial-management/management-analytics/analytics-variance/services/variance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const detail = await loadDetail(toId(id));
    return ok(detail);
  } catch (error) {
    return handleRouteError(error, "GET /variance/[id]", "That exception could not be read.");
  }
}
