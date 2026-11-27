import { listLoanRequests, saveLoanRequest } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withRequestAccess } from "./_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withRequestAccess(() => listLoanRequests(new URL(request.url).searchParams));
}

export async function POST(request: Request) {
  return withRequestAccess(async actor => saveLoanRequest(
    await request.json().catch(() => null), request.headers.get("Idempotency-Key"), actor,
  ), 201);
}
