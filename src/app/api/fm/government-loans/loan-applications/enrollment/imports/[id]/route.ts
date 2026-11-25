import { getLoanImport } from "@/modules/financial-management/government-loans/server/loan-imports";
import { requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withRequestAccess } from "../../../requests/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withRequestAccess(async () => getLoanImport(requestId((await params).id)));
}
