import { NextRequest } from "next/server";

import { accountBodySchema } from "@/modules/financial-management/treasury/loan-management/loan-register/settings/schemas";
import { createAccount } from "@/modules/financial-management/treasury/loan-management/loan-register/settings/services/settings.service";

import { currentUserId, fail, handleRouteError, ok, readJson } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    if (body === undefined) return fail("Send the account as JSON.", 400);

    const parsed = accountBodySchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error, "POST payment account", "The account could not be saved.");

    return ok(await createAccount(parsed.data, await currentUserId()), 201);
  } catch (error) {
    return handleRouteError(error, "POST payment account", "The account could not be saved.");
  }
}
