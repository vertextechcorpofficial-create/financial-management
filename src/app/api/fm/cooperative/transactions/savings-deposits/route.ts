import { listActiveCooperativeMembers } from "@/modules/financial-management/cooperative/server/loan-enrollment";
import { LoanError } from "@/modules/financial-management/cooperative/server/loans";
import { todayManila } from "@/modules/financial-management/cooperative/server/member-read";
import { postSavingsDeposit, previewSavingsDeposit } from "@/modules/financial-management/cooperative/server/savings-deposits";
import { transactionIndexEnabled } from "@/modules/financial-management/cooperative/server/transaction-index";
import { withLoans } from "../../loans/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withLoans(async () => {
    if (!transactionIndexEnabled()) throw new LoanError(409, "Counter savings deposits are pending rollout.", "PENDING_ROLLOUT");
    return { ...await listActiveCooperativeMembers(new URL(request.url).searchParams), today: todayManila() };
  }, "transactions");
}

export async function POST(request: Request) {
  return withLoans(async actor => {
    const body = await request.json().catch(() => null);
    if (body?.action === "preview") return previewSavingsDeposit(body);
    if (body?.action === "post") return postSavingsDeposit(body, actor);
    throw new LoanError(400, "Choose whether to review or post a deposit.");
  }, "transactions");
}
