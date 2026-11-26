import { listLoanRequests, saveLoanRequest } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return withLoanRequestAccess("my-loans", actor => listLoanRequests(new URL(request.url).searchParams, actor.actorId));
}

export function POST(request: Request) {
  return withLoanRequestAccess("my-loans", async actor => saveLoanRequest(
    await request.json().catch(() => null), request.headers.get("Idempotency-Key"), actor, undefined, actor.actorId,
  ), 201);
}
