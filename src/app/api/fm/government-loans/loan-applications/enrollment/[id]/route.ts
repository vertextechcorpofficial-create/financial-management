import { getLoanEnrollment } from "@/modules/financial-management/government-loans/server/loan-enrollment";
import { requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withRequestAccess } from "../../requests/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withRequestAccess(async () => getLoanEnrollment(requestId((await params).id)));
}
