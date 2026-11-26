import { readOwnLoan } from "@/modules/financial-management/government-loans/server/loan-reports";
import { parseInput, positiveId } from "@/modules/financial-management/government-loans/server/request-input";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLoanRequestAccess("my-loans", async actor => {
    const id = parseInput(positiveId, (await params).id);
    return readOwnLoan(id, actor.actorId);
  });
}
