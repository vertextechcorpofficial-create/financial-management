import { NextRequest } from "next/server";

import { approveBodySchema } from "@/modules/financial-management/treasury/loan-management/loan-approvals/schemas";
import { approveLoan } from "@/modules/financial-management/treasury/loan-management/loan-approvals/services/approvals.service";

import { currentUserId, fail, handleRouteError, ok, readJson, toId } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const loanId = toId(id);
    if (!loanId) return fail("Unknown loan.", 400);

    const body = (await readJson(request)) ?? {};
    const parsed = approveBodySchema.safeParse(body);
    if (!parsed.success) return handleRouteError(parsed.error, "POST approve", "The loan could not be approved.");

    const actorId = await currentUserId();
    const result = await approveLoan(loanId, parsed.data.remarks ?? "", actorId);
    return ok(result);
  } catch (error) {
    return handleRouteError(error, "POST approve", "The loan could not be approved.");
  }
}
