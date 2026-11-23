import { z } from "zod";

import { currentUserId, handleRouteError, ok } from "../../_lib/http";
import { scanPeriod } from "@/modules/financial-management/management-analytics/analytics-variance/services/variance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Use a month like 2026-11.").optional(),
  company: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const actorId = await currentUserId();
    const result = await scanPeriod({ period: body.period, company: body.company, actorId });
    return ok(result, 201);
  } catch (error) {
    return handleRouteError(error, "POST /variance/scan", "The scan could not be completed.");
  }
}
