import { z } from "zod";

import { currentUserId, handleRouteError, ok } from "../../_lib/http";
import { escalateSweep } from "@/modules/financial-management/management-analytics/analytics-variance/services/variance.service";
import { phtToday } from "@/modules/financial-management/management-analytics/analytics-variance/pht";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-19.").optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const actorId = await currentUserId();
    const result = await escalateSweep(body.today ?? phtToday(), actorId);
    return ok(result);
  } catch (error) {
    return handleRouteError(error, "POST /variance/escalate", "The escalation sweep could not be completed.");
  }
}
