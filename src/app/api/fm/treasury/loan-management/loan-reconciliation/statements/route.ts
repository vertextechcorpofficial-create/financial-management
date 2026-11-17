import { NextRequest } from "next/server";

import { statementBodySchema, statementFilterSchema } from "@/modules/financial-management/treasury/loan-management/loan-reconciliation/schemas";
import {
  assertStatementDateOpen,
  listStatements,
  recordStatement,
} from "@/modules/financial-management/treasury/loan-management/loan-reconciliation/services/statements.service";
import { currentLock } from "@/modules/financial-management/treasury/loan-management/loan-reconciliation/services/reconciliation.service";

import { currentUserId, fail, handleRouteError, ok, readJson } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const parsed = statementFilterSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return fail("Some filters need attention.", 400);

    const result = await listStatements(parsed.data);
    return ok(result);
  } catch (error) {
    return handleRouteError(error, "GET lender statements", "The statements could not be read.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    if (body === undefined) return fail("Send the statement as JSON.", 400);

    const parsed = statementBodySchema.safeParse(body);
    if (!parsed.success) {
      return handleRouteError(parsed.error, "POST lender statement", "The statement could not be recorded.");
    }

    const lock = await currentLock();
    await assertStatementDateOpen(parsed.data.statementDate, lock?.locked_through ?? null);

    const actorId = await currentUserId();
    const recorded = await recordStatement(parsed.data, actorId);
    return ok(recorded, 201);
  } catch (error) {
    return handleRouteError(error, "POST lender statement", "The statement could not be recorded.");
  }
}
