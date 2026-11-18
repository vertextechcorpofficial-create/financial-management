import { NextRequest } from "next/server";

import { lockBodySchema } from "@/modules/financial-management/treasury/loan-management/loan-register/settings/schemas";
import { closeBooks } from "@/modules/financial-management/treasury/loan-management/loan-register/settings/services/settings.service";

import { currentUserId, fail, handleRouteError, ok, readJson } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    if (body === undefined) return fail("Send the closing date as JSON.", 400);

    const parsed = lockBodySchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error, "POST period lock", "The books could not be closed.");

    return ok(await closeBooks(parsed.data, await currentUserId()), 201);
  } catch (error) {
    return handleRouteError(error, "POST period lock", "The books could not be closed.");
  }
}
