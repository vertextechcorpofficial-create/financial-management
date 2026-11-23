import { decideLoan, getLoanDecision } from "@/modules/financial-management/cooperative/server/loan-decisions";
import { withLoans } from "../../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return withLoans(async () => getLoanDecision(Number((await params).id)));
}

export async function POST(request: Request, { params }: Context) {
  return withLoans(async actor => decideLoan(Number((await params).id), await request.json().catch(() => null), actor));
}
