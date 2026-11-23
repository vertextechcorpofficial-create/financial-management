import { z } from "zod";

import { currentUserId, handleRouteError, ok } from "../../_lib/http";
import { createAction } from "@/modules/financial-management/management-analytics/analytics-review/services/review.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reviewId: z.number().int().positive().nullish(),
  exceptionId: z.number().int().positive().nullish(),
  companyCode: z.string().optional(),
  title: z.string().trim().min(3, "Say what will be done.").max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-05.").nullish(),
  notes: z.string().max(2000).nullish(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json());
    const actorId = await currentUserId();
    const action = await createAction(
      {
        reviewId: body.reviewId ?? null,
        exceptionId: body.exceptionId ?? null,
        companyCode: body.companyCode,
        title: body.title,
        dueDate: body.dueDate ?? null,
        notes: body.notes ?? null,
      },
      actorId,
    );
    return ok(action, 201);
  } catch (error) {
    return handleRouteError(error, "POST /review/action", "The action could not be recorded.");
  }
}
