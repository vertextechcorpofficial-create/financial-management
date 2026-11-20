import { z } from "zod";

import { currentUserId, handleRouteError, ok, toId } from "../../../_lib/http";
import { recordReading } from "@/modules/financial-management/management-analytics/analytics-variance/services/variance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Use a month like 2026-11."),
  value: z.number().finite(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const actorId = await currentUserId();
    const detail = await recordReading(toId(id), body, actorId);
    return ok(detail, 201);
  } catch (error) {
    return handleRouteError(error, "POST /variance/[id]/reading", "The reading could not be recorded.");
  }
}
