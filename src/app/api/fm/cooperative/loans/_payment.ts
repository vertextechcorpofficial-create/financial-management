import { getPaymentReceipt } from "@/modules/financial-management/cooperative/server/loan-payment-register";
import { getLoanPaymentPreview, getLoanPaymentSummary, postLoanPayment } from "@/modules/financial-management/cooperative/server/loan-payments";
import { LoanError } from "@/modules/financial-management/cooperative/server/loans";
import { listRemittanceRuns } from "@/modules/financial-management/cooperative/server/payroll-remittance-store";
import { postIndividualRemittance, previewIndividualRemittance } from "@/modules/financial-management/cooperative/server/payroll-remittances";
import { cooperativeReceiptPdf } from "../_receipt-pdf";
import { withLoans } from "./_response";

type Workspace = "loans" | "transactions";

export function serveLoanPayment(request: Request, id: number, workspace: Workspace) {
  return withLoans(async actor => {
    if (request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (body?.channel === "PAYROLL") {
        if (body.action === "preview") return previewIndividualRemittance(id, body);
        if (body.action === "post") return postIndividualRemittance(id, body, actor);
      }
      if (body?.action === "preview") return getLoanPaymentPreview(id, body);
      if (body?.action === "post") return postLoanPayment(id, body, actor);
      throw new LoanError(400, "Choose whether to review or post a payment.");
    }
    const query = new URL(request.url).searchParams;
    if (query.get("action") === "runs") return listRemittanceRuns(query);
    const receipt = query.get("receipt");
    return receipt === null ? getLoanPaymentSummary(id) : printReceipt(id, Number(receipt));
  }, workspace);
}

async function printReceipt(id: number, paymentId: number) {
  const receipt = await getPaymentReceipt(id, paymentId);
  if (!receipt.orNo) throw new LoanError(404, "The official receipt is unavailable.");
  return cooperativeReceiptPdf(receipt.orNo, [
    ["Member", receipt.memberName], ["Loan", receipt.loanNo], ["Receipt date", receipt.receiptDate],
    ["Posting date", receipt.businessDate], ["Journal", receipt.journalNo],
    ...(receipt.reference ? [["Reference", receipt.reference]] as [string, string][] : []), ["Channel", "Over the counter"],
    ["Principal", `PHP ${receipt.principal}`], ["Interest or markup", `PHP ${receipt.interest}`],
    ["Penalty", `PHP ${receipt.penalty}`], ["Total received", `PHP ${receipt.amount}`],
  ], receipt.reversed);
}
