import { currentUserId, handleRouteError, ok } from "../../../../_lib/http";
import { refreshSource } from "@/modules/financial-management/management-analytics/analytics-data/services/data.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await context.params;
    const actorId = await currentUserId();
    return ok(await refreshSource(decodeURIComponent(key), actorId));
  } catch (error) {
    return handleRouteError(error, "data/sources/[key]/refresh", "The source could not be re-read.");
  }
}
