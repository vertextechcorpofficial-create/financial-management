import { z } from "zod";

import { currentUserId, handleRouteError, ok, toId } from "../../_lib/http";
import { updateReview } from "@/modules/financial-management/management-analytics/analytics-review/services/review.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  attendees: z.string().max(255).nullish(),
  minutes: z.string().max(20000).nullish(),
  status: z.enum(["DRAFT", "FINAL"]).optional(),
  chairUserId: z.number().int().positive().nullish(),
  refreshAgenda: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const actorId = await currentUserId();
    const detail = await updateReview(
      toId(id),
      {
        attendees: body.attendees ?? undefined,
        minutes: body.minutes ?? undefined,
        status: body.status,
        chairUserId: body.chairUserId ?? undefined,
        refreshAgenda: body.refreshAgenda,
      },
      actorId,
    );
    return ok(detail);
  } catch (error) {
    return handleRouteError(error, "PATCH /review/[id]", "The meeting could not be saved.");
  }
}
