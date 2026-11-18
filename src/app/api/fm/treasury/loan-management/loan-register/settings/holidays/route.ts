import { NextRequest } from "next/server";

import { holidayBodySchema } from "@/modules/financial-management/treasury/loan-management/loan-register/settings/schemas";
import { createHoliday } from "@/modules/financial-management/treasury/loan-management/loan-register/settings/services/settings.service";

import { currentUserId, fail, handleRouteError, ok, readJson } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    if (body === undefined) return fail("Send the holiday as JSON.", 400);

    const parsed = holidayBodySchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error, "POST holiday", "The holiday could not be saved.");

    return ok(await createHoliday(parsed.data, await currentUserId()), 201);
  } catch (error) {
    return handleRouteError(error, "POST holiday", "The holiday could not be saved.");
  }
}
