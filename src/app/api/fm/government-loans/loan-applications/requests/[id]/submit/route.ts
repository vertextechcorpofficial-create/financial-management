import { requestId, submitLoanRequest } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withRequestAccess } from "../../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withRequestAccess(async actor => submitLoanRequest(
    requestId((await params).id), await request.json().catch(() => null), request.headers.get("Idempotency-Key"), actor,
  ));
}
