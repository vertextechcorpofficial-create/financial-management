import { recordImportTransfer } from "@/modules/financial-management/government-loans/server/loan-enrollment";
import { requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withRequestAccess } from "../../../requests/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withRequestAccess(async actor => recordImportTransfer(
    requestId((await params).id), await request.json().catch(() => null), request.headers.get("Idempotency-Key"), actor,
  ));
}
