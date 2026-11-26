import { readDisputes, updateDispute } from "@/modules/financial-management/government-loans/server/posting-disputes";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return withLoanRequestAccess("loans", () => readDisputes(new URL(request.url).searchParams));
}
export function POST(request: Request) {
  return withLoanRequestAccess("loans", async actor => updateDispute(
    await request.json().catch(() => null), request.headers.get("Idempotency-Key"), actor));
}
