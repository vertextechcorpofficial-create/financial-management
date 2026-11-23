import { getLoanRegister } from "@/modules/financial-management/cooperative/server/loans";
import { saveLoanEnrollment } from "@/modules/financial-management/cooperative/server/loan-enrollment-save";
import { withLoans } from "./_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withLoans(() => getLoanRegister(new URL(request.url).searchParams));
}

export async function POST(request: Request) {
  return withLoans(async actor => {
    const result = await saveLoanEnrollment(await request.json().catch(() => null), actor);
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  });
}
