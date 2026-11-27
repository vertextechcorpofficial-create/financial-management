import { decideLoan, getLoanDecision } from "@/modules/financial-management/cooperative/server/loan-decisions";
import { LoanError } from "@/modules/financial-management/cooperative/server/loans";
import { decideWithdrawal } from "@/modules/financial-management/cooperative/server/withdrawals";
import { withApprovals } from "../../../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ type: string; id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return withApprovals(async () => {
    const { type, id } = await params;
    if (type !== "loan") throw new LoanError(404, "This approval action is unavailable.");
    return getLoanDecision(Number(id));
  });
}

export async function POST(request: Request, { params }: Context) {
  return withApprovals(async actor => {
    const { type, id } = await params;
    if (type === "withdrawal") return decideWithdrawal(Number(id), await request.json().catch(() => null), actor);
    if (type !== "loan") throw new LoanError(404, "This approval action is unavailable.");
    return decideLoan(Number(id), await request.json().catch(() => null), actor);
  });
}
