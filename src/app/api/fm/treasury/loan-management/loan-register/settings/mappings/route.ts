import { NextRequest } from "next/server";

import { mappingCreateBodySchema } from "@/modules/financial-management/treasury/loan-management/loan-register/settings/schemas";
import { createMapping } from "@/modules/financial-management/treasury/loan-management/loan-register/settings/services/settings.service";

import { currentUserId, fail, handleRouteError, ok, readJson } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    if (body === undefined) return fail("Send the line account as JSON.", 400);

    const parsed = mappingCreateBodySchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error, "POST GL mapping", "The line account could not be added.");

    return ok(await createMapping(parsed.data, await currentUserId()));
  } catch (error) {
    return handleRouteError(error, "POST GL mapping", "The line account could not be added.");
  }
}
