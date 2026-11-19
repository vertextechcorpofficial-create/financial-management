import { NextRequest } from "next/server";

import { detailQuerySchema } from "@/modules/financial-management/treasury/loan-management/loan-approvals/schemas";
import { loadDetail } from "@/modules/financial-management/treasury/loan-management/loan-approvals/services/approvals.service";

import { currentUserId, fail, handleRouteError, ok, toId } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const loanId = toId(id);
    if (!loanId) return fail("Unknown loan.", 400);

    const parsed = detailQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return fail("Some filters need attention.", 400);

    const actorId = await currentUserId();
    const detail = await loadDetail(loanId, actorId, parsed.data.channel ?? "TRANSFER", parsed.data.accountId ?? null);
    return ok(detail);
  } catch (error) {
    return handleRouteError(error, "GET loan approval detail", "That loan could not be read.");
  }
}
