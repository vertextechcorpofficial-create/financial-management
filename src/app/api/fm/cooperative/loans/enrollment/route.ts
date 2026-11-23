import { loanEnrollmentChoices, previewLoanEnrollment } from "@/modules/financial-management/cooperative/server/loan-enrollment";
import { withLoans } from "../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withLoans(() => loanEnrollmentChoices(new URL(request.url).searchParams));
}

export async function POST(request: Request) {
  return withLoans(async () => previewLoanEnrollment(await request.json().catch(() => null)));
}
