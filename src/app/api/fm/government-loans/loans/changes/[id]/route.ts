import { getLoanChanges, recordLoanChange } from "@/modules/financial-management/government-loans/server/loan-changes";
import { exchangeLoanInstruction } from "@/modules/financial-management/government-loans/server/change-exchange";
import { requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export function GET(_request: Request, context: Context) {
  return withLoanRequestAccess("loans", async () => getLoanChanges(requestId((await context.params).id)));
}
export function POST(request: Request, context: Context) {
  return withLoanRequestAccess("loans", async actor => {
    const id = requestId((await context.params).id);
    const input: unknown = await request.json().catch(() => null);
    const key = request.headers.get("Idempotency-Key");
    return new URL(request.url).searchParams.get("exchange") === "1"
      ? exchangeLoanInstruction(id, input, key, actor) : recordLoanChange(id, input, key, actor);
  });
}
