import { NextRequest } from "next/server";

import { signOffReconciliation } from "@/modules/financial-management/treasury/loan-management/loan-reconciliation/services/reconciliation.service";

import { currentUserId, fail, handleRouteError, ok, readJson, toId } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignOffBody = { remarks?: string };

/** Sign-off writes the actor and the PHT wall clock once; a locked, already-signed or unreconciled period is a 409. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const rowId = toId(id);
    if (!rowId) return fail("That reconciliation row does not exist.", 404);

    const body = (await readJson(request)) as SignOffBody | undefined;
    const remarks = typeof body?.remarks === "string" ? body.remarks : undefined;

    const actorId = await currentUserId();
    const row = await signOffReconciliation(rowId, actorId, remarks);
    return ok(row);
  } catch (error) {
    return handleRouteError(error, "POST loan reconciliation sign-off", "The period could not be signed off.");
  }
}
