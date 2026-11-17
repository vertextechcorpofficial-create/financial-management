import { NextRequest } from "next/server";

import { accountPatchSchema } from "@/modules/financial-management/treasury/loan-management/loan-settings/schemas";
import { updateAccount } from "@/modules/financial-management/treasury/loan-management/loan-settings/services/settings.service";

import { currentUserId, fail, handleRouteError, ok, readJson, toId } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const accountId = toId(id);
    if (!accountId) return fail("Unknown payment account.", 400);

    const body = await readJson(request);
    if (body === undefined) return fail("Send the change as JSON.", 400);

    const parsed = accountPatchSchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error, "PATCH payment account", "The account could not be saved.");

    return ok(await updateAccount(accountId, parsed.data, await currentUserId()));
  } catch (error) {
    return handleRouteError(error, "PATCH payment account", "The account could not be saved.");
  }
}
