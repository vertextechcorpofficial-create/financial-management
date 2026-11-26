import { submitLoanRequest, requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLoanRequestAccess("my-loans", async actor => submitLoanRequest(
    requestId((await params).id), await request.json().catch(() => null), request.headers.get("Idempotency-Key"), actor, actor.actorId,
  ));
}
