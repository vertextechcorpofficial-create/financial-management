import { z } from "zod";

import { currentUserId, fieldErrorsFromZod, fail, handleRouteError, ok } from "../../_lib/http";
import { saveReading } from "@/modules/financial-management/management-analytics/analytics-data/services/data.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kpiId: z.number().int().positive(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Use a month like 2026-11."),
  value: z.number(),
  basis: z.enum(["ACTUAL", "PROVISIONAL"]).optional(),
  sourceCode: z.string().min(1).max(20).nullish(),
  note: z.string().max(255).nullish(),
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(((await request.json()) as unknown));
    if (!parsed.success) {
      return fail("Some fields need attention.", 400, { fieldErrors: fieldErrorsFromZod(parsed.error) });
    }
    const actorId = await currentUserId();
    const result = await saveReading(parsed.data, actorId);
    return ok(result, result.created ? 201 : 200);
  } catch (error) {
    return handleRouteError(error, "data/readings", "The reading could not be saved.");
  }
}
