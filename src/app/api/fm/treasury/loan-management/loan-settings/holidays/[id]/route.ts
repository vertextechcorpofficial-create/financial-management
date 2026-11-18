import { NextRequest } from "next/server";

import { holidayPatchSchema } from "@/modules/financial-management/treasury/loan-management/loan-settings/schemas";
import {
  deleteHoliday,
  updateHoliday,
} from "@/modules/financial-management/treasury/loan-management/loan-settings/services/settings.service";

import { currentUserId, fail, handleRouteError, ok, readJson, toId } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const holidayId = toId(id);
    if (!holidayId) return fail("Unknown holiday.", 400);

    const body = await readJson(request);
    if (body === undefined) return fail("Send the change as JSON.", 400);

    const parsed = holidayPatchSchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error, "PATCH holiday", "The holiday could not be saved.");

    return ok(await updateHoliday(holidayId, parsed.data, await currentUserId()));
  } catch (error) {
    return handleRouteError(error, "PATCH holiday", "The holiday could not be saved.");
  }
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const holidayId = toId(id);
    if (!holidayId) return fail("Unknown holiday.", 400);
    return ok(await deleteHoliday(holidayId));
  } catch (error) {
    return handleRouteError(error, "DELETE holiday", "The holiday could not be removed.");
  }
}
