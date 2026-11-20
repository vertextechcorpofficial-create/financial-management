import { z } from "zod";

import { currentUserId, fail, handleRouteError, ok, toId } from "../../../_lib/http";
import { closeException } from "@/modules/financial-management/management-analytics/analytics-variance/services/variance.service";

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
    const result = await closeException(toId(id), body.note ?? null, actorId);
    if (result.have < result.needed) {
      return fail(
        `Closing needs ${result.needed} consecutive in-tolerance readings; this exception has ${result.have}.`,
        409,
        { needed: result.needed, have: result.have },
      );
    }
    return ok(result.detail);
  } catch (error) {
    return handleRouteError(error, "POST /variance/[id]/close", "The exception could not be closed.");
  }
}
