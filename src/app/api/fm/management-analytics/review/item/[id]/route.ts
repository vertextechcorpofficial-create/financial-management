import { z } from "zod";

import { currentUserId, handleRouteError, ok, toId } from "../../../_lib/http";
import { updateItemRow } from "@/modules/financial-management/management-analytics/analytics-review/services/review.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  notes: z.string().max(4000).nullish(),
  decision: z.string().max(2000).nullish(),
  minutesAlloc: z.number().int().min(1).max(60).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const actorId = await currentUserId();
    const item = await updateItemRow(
      toId(id),
      { notes: body.notes ?? undefined, decision: body.decision ?? undefined, minutesAlloc: body.minutesAlloc },
      actorId,
    );
    return ok(item);
  } catch (error) {
    return handleRouteError(error, "PATCH /review/item/[id]", "That agenda item could not be saved.");
  }
}
