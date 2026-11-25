import { getLoanRequest, requestId, saveLoanRequest } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Route = { params: Promise<{ id: string }> };

export function GET(_request: Request, { params }: Route) {
  return withLoanRequestAccess("my-loans", async actor => getLoanRequest(requestId((await params).id), actor.actorId));
}

export function PATCH(request: Request, { params }: Route) {
  return withLoanRequestAccess("my-loans", async actor => saveLoanRequest(
    await request.json().catch(() => null), request.headers.get("Idempotency-Key"), actor, requestId((await params).id), actor.actorId,
  ));
}
