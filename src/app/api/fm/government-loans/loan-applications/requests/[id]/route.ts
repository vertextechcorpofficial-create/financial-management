import { getLoanRequest, requestId, saveLoanRequest } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withRequestAccess } from "../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Route = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Route) {
  return withRequestAccess(async () => getLoanRequest(requestId((await params).id)));
}

export async function PATCH(request: Request, { params }: Route) {
  return withRequestAccess(async actor => saveLoanRequest(
    await request.json().catch(() => null), request.headers.get("Idempotency-Key"), actor, requestId((await params).id),
  ));
}
