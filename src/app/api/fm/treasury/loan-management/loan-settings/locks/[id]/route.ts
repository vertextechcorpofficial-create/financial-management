import { NextRequest } from "next/server";

import { reopenBodySchema } from "@/modules/financial-management/treasury/loan-management/loan-settings/schemas";
import { reopenBooks } from "@/modules/financial-management/treasury/loan-management/loan-settings/services/settings.service";

import { currentUserId, fail, handleRouteError, ok, readJson, toId } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const lockId = toId(id);
    if (!lockId) return fail("Unknown period lock.", 400);

    const body = await readJson(request);
    if (body === undefined) return fail("Send the reason as JSON.", 400);

    const parsed = reopenBodySchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error, "POST reopen period", "The period could not be reopened.");

    return ok(await reopenBooks(lockId, parsed.data.reason, await currentUserId()));
  } catch (error) {
    return handleRouteError(error, "POST reopen period", "The period could not be reopened.");
  }
}
