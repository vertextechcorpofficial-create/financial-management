import { listOnboardingExits, recordOnboardingExit } from "@/modules/financial-management/government-loans/server/onboarding-exits";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return withLoanRequestAccess("loans", () => listOnboardingExits(new URL(request.url).searchParams));
}
export function POST(request: Request) {
  return withLoanRequestAccess("loans", async actor => recordOnboardingExit(
    await request.json().catch(() => null), request.headers.get("Idempotency-Key"), actor));
}
