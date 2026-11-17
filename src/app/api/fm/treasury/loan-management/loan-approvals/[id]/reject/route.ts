import { NextRequest } from "next/server";

import { rejectBodySchema } from "@/modules/financial-management/treasury/loan-management/loan-approvals/schemas";
import { rejectLoan } from "@/modules/financial-management/treasury/loan-management/loan-approvals/services/approvals.service";

import { currentUserId, fail, handleRouteError, ok, readJson, toId } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const loanId = toId(id);
    if (!loanId) return fail("Unknown loan.", 400);

    const body = await readJson(request);
    if (body === undefined) return fail("Send the reason as JSON.", 400);

    const parsed = rejectBodySchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error, "POST reject", "The loan could not be rejected.");

    const actorId = await currentUserId();
    const result = await rejectLoan(loanId, parsed.data.reason, actorId);
    return ok(result);
  } catch (error) {
    return handleRouteError(error, "POST reject", "The loan could not be rejected.");
  }
}
