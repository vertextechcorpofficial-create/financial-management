import { cookies } from "next/headers";

import { COOKIE_NAME } from "@/lib/auth-utils";
import { currentUserId, handleRouteError, ok } from "../../../../_lib/http";
import { refreshSource } from "@/modules/financial-management/management-analytics/analytics-data/services/data.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await context.params;
    const actorId = await currentUserId();
    const store = await cookies();
    const bearerToken = store.get(COOKIE_NAME)?.value ?? null;
    const body = (await request.json().catch(() => ({}))) as { period?: string };
    return ok(await refreshSource(decodeURIComponent(key), actorId, { period: body.period, bearerToken }));
  } catch (error) {
    return handleRouteError(error, "data/sources/[key]/refresh", "The source could not be re-read.");
  }
}
