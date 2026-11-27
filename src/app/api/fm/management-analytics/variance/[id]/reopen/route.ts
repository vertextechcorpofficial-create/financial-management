import { z } from "zod";

import { currentUserId, handleRouteError, ok, toId } from "../../../_lib/http";
import { reopenException } from "@/modules/financial-management/management-analytics/analytics-variance/services/variance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  note: z.string().trim().max(255).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const actorId = await currentUserId();
    const detail = await reopenException(toId(id), body.note ?? null, actorId);
    return ok(detail);
  } catch (error) {
    return handleRouteError(error, "POST /variance/[id]/reopen", "The exception could not be reopened.");
  }
}
