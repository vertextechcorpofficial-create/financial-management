import { z } from "zod";

import { currentUserId, handleRouteError, ok, toId } from "../../../_lib/http";
import { fileMemo } from "@/modules/financial-management/management-analytics/analytics-variance/services/variance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  memo: z.string().trim().min(20, "A memo needs a sentence or two; 20 characters at least."),
  ownerPosition: z.string().trim().max(120).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const actorId = await currentUserId();
    const detail = await fileMemo(toId(id), body.memo, actorId, body.ownerPosition ?? null);
    return ok(detail);
  } catch (error) {
    return handleRouteError(error, "POST /variance/[id]/memo", "The memo could not be filed.");
  }
}
