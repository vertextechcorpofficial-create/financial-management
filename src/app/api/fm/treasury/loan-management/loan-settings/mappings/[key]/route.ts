import { NextRequest } from "next/server";

import { mappingBodySchema } from "@/modules/financial-management/treasury/loan-management/loan-settings/schemas";
import { updateMapping } from "@/modules/financial-management/treasury/loan-management/loan-settings/services/settings.service";

import { currentUserId, fail, handleRouteError, ok, readJson } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, context: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await context.params;
    const mappingKey = decodeURIComponent(key).trim().toUpperCase();
    if (!mappingKey) return fail("Unknown GL key.", 400);

    const body = await readJson(request);
    if (body === undefined) return fail("Send the mapping as JSON.", 400);

    const parsed = mappingBodySchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error, "PATCH GL mapping", "The mapping could not be saved.");

    return ok(await updateMapping(mappingKey, parsed.data.coaId, await currentUserId()));
  } catch (error) {
    return handleRouteError(error, "PATCH GL mapping", "The mapping could not be saved.");
  }
}
