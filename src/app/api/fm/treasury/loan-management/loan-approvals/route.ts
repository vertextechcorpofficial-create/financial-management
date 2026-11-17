import { NextRequest } from "next/server";

import { queueQuerySchema } from "@/modules/financial-management/treasury/loan-management/loan-approvals/schemas";
import { loadQueue } from "@/modules/financial-management/treasury/loan-management/loan-approvals/services/approvals.service";

import { currentUserId, fail, handleRouteError, ok } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const parsed = queueQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      return fail("Some filters need attention.", 400, {
        fieldErrors: parsed.error.issues.reduce<Record<string, string[]>>((acc, issue) => {
          const key = issue.path.join(".") || "filter";
          acc[key] = [...(acc[key] ?? []), issue.message];
          return acc;
        }, {}),
      });
    }

    const actorId = await currentUserId();
    const queue = await loadQueue(parsed.data, actorId);
    return ok(queue);
  } catch (error) {
    return handleRouteError(error, "GET loan approvals", "The approvals queue could not be read.");
  }
}
