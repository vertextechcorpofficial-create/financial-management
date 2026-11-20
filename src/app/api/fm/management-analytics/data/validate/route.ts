import { z } from "zod";

import { currentUserId, fail, fieldErrorsFromZod, handleRouteError, ok } from "../../_lib/http";
import { runValidation } from "@/modules/financial-management/management-analytics/analytics-data/services/data.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, "Use a month like 2026-11.") });

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(((await request.json()) as unknown));
    if (!parsed.success) {
      return fail("Some fields need attention.", 400, { fieldErrors: fieldErrorsFromZod(parsed.error) });
    }
    const actorId = await currentUserId();
    return ok(await runValidation(parsed.data.period, actorId));
  } catch (error) {
    return handleRouteError(error, "data/validate", "The checks could not be run.");
  }
}
