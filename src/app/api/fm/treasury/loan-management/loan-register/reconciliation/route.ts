import { NextRequest } from "next/server";

import { reconciliationFilterSchema, saveReconciliationSchema } from "@/modules/financial-management/treasury/loan-management/loan-register/reconciliation/schemas";
import {
  listReconciliations,
  saveReconciliation,
} from "@/modules/financial-management/treasury/loan-management/loan-register/reconciliation/services/reconciliation.service";

import { currentUserId, fail, handleRouteError, ok, readJson } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const parsed = reconciliationFilterSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return fail("Some filters need attention.", 400);

    const result = await listReconciliations(parsed.data);
    return ok(result);
  } catch (error) {
    return handleRouteError(error, "GET loan reconciliation", "The reconciliations could not be read.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    if (body === undefined) return fail("Send the period as JSON.", 400);

    const parsed = saveReconciliationSchema.safeParse(body);
    if (!parsed.success) {
      return handleRouteError(parsed.error, "POST loan reconciliation", "The roll-forward could not be saved.");
    }

    const actorId = await currentUserId();
    const saved = await saveReconciliation(
      {
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
        remarks: parsed.data.remarks,
      },
      actorId,
    );
    return ok(saved, 201);
  } catch (error) {
    return handleRouteError(error, "POST loan reconciliation", "The roll-forward could not be saved.");
  }
}
