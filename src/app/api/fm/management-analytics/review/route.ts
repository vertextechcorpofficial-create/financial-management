import { z } from "zod";

import { currentUserId, handleRouteError, ok } from "../_lib/http";
import { loadReview, openReview } from "@/modules/financial-management/management-analytics/analytics-review/services/review.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const detail = await loadReview({
      period: url.searchParams.get("period") ?? undefined,
      company: url.searchParams.get("company") ?? undefined,
    });
    return ok(detail);
  } catch (error) {
    return handleRouteError(error, "GET /review", "The meeting could not be read.");
  }
}

const bodySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Use a month like 2026-11.").optional(),
  company: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const actorId = await currentUserId();
    const detail = await openReview({ period: body.period, company: body.company, actorId });
    return ok(detail, 201);
  } catch (error) {
    return handleRouteError(error, "POST /review", "The meeting could not be opened.");
  }
}
