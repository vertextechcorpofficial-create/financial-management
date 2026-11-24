import { getLoanReversalPreview, reverseLoanPayment } from "@/modules/financial-management/cooperative/server/loan-payments";
import { LoanError } from "@/modules/financial-management/cooperative/server/loans";
import { remittanceLinks } from "@/modules/financial-management/cooperative/server/payroll-remittance-store";
import { withLoans } from "../../../../loans/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  return withLoans(async actor => {
    const id = Number((await params).id);
    const body = await request.json().catch(() => null);
    if (Number.isSafeInteger(body?.paymentId) && body.paymentId > 0 && (await remittanceLinks("payment_id", [body.paymentId])).size) {
      throw new LoanError(409, "Open the linked Payroll remittance batch in Batch history to reverse this payment.", "REMITTANCE_REVERSAL_REQUIRED");
    }
    if (body?.action === "preview") return getLoanReversalPreview(id, body);
    if (body?.action === "post") return reverseLoanPayment(id, body, actor);
    throw new LoanError(400, "Choose whether to review or post a reversal.");
  }, "transactions");
}
