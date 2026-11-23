import { getLoanReversalPreview, reverseLoanPayment } from "@/modules/financial-management/cooperative/server/loan-payments";
import { LoanError } from "@/modules/financial-management/cooperative/server/loans";
import { withLoans } from "../../../../loans/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  return withLoans(async actor => {
    const id = Number((await params).id);
    const body = await request.json().catch(() => null);
    if (body?.action === "preview") return getLoanReversalPreview(id, body);
    if (body?.action === "post") return reverseLoanPayment(id, body, actor);
    throw new LoanError(400, "Choose whether to review or post a reversal.");
  }, "transactions");
}
