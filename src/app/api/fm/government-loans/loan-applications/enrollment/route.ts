import { listLoanEnrollments, saveLoanEnrollment } from "@/modules/financial-management/government-loans/server/loan-enrollment";
import { withRequestAccess } from "../requests/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withRequestAccess(() => listLoanEnrollments(new URL(request.url).searchParams));
}

export async function POST(request: Request) {
  return withRequestAccess(async actor => saveLoanEnrollment(
    await request.json().catch(() => null), request.headers.get("Idempotency-Key"), actor,
  ), 201);
}
