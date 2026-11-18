import { NextRequest } from "next/server";

import { rollForwardQuerySchema } from "@/modules/financial-management/treasury/loan-management/loan-reconciliation/schemas";
import { buildRollForward } from "@/modules/financial-management/treasury/loan-management/loan-reconciliation/services/reconciliation.service";

import { handleRouteError, ok } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Preview only: reads the ledger and the documents, writes nothing. Saving is a separate POST. */
export async function GET(request: NextRequest) {
  try {
    const parsed = rollForwardQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) {
      return handleRouteError(parsed.error, "GET roll-forward", "The roll-forward could not be built.");
    }

    const rollForward = await buildRollForward(parsed.data);
    return ok(rollForward);
  } catch (error) {
    return handleRouteError(error, "GET roll-forward", "The roll-forward could not be built.");
  }
}
