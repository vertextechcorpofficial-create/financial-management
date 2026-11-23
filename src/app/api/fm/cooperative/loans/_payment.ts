import { jsPDF } from "jspdf";
import { getPaymentReceipt } from "@/modules/financial-management/cooperative/server/loan-payment-register";
import { getLoanPaymentPreview, getLoanPaymentSummary, postLoanPayment } from "@/modules/financial-management/cooperative/server/loan-payments";
import { LoanError } from "@/modules/financial-management/cooperative/server/loans";
import { withLoans } from "./_response";

type Workspace = "loans" | "transactions";

export function serveLoanPayment(request: Request, id: number, workspace: Workspace) {
  return withLoans(async actor => {
    if (request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (body?.action === "preview") return getLoanPaymentPreview(id, body);
      if (body?.action === "post") return postLoanPayment(id, body, actor);
      throw new LoanError(400, "Choose whether to review or post a payment.");
    }
    const receipt = new URL(request.url).searchParams.get("receipt");
    return receipt === null ? getLoanPaymentSummary(id) : printReceipt(id, Number(receipt));
  }, workspace);
}

async function printReceipt(id: number, paymentId: number) {
  const receipt = await getPaymentReceipt(id, paymentId);
  const pdf = new jsPDF({ unit: "mm", format: "a5" });
  pdf.setProperties({ title: `Cooperative Official Receipt ${receipt.orNo}` });
  pdf.setFontSize(16);
  pdf.text("Employee Cooperative", 14, 21);
  pdf.setFontSize(12);
  pdf.text(`Official receipt ${receipt.orNo}`, 14, 30);
  if (receipt.reversed) pdf.text("Reversed", 134, 30, { align: "right" });
  pdf.line(14, 35, 134, 35);
  const rows = [
    ["Member", receipt.memberName], ["Loan", receipt.loanNo], ["Receipt date", receipt.receiptDate],
    ["Posting date", receipt.businessDate], ["Journal", receipt.journalNo],
    ...(receipt.reference ? [["Reference", receipt.reference]] : []), ["Channel", "Over the counter"],
    ["Principal", `PHP ${receipt.principal}`], ["Interest or markup", `PHP ${receipt.interest}`],
    ["Penalty", `PHP ${receipt.penalty}`], ["Total received", `PHP ${receipt.amount}`],
  ];
  pdf.setFontSize(10);
  let y = 44;
  for (const [label, value] of rows) {
    const lines = pdf.splitTextToSize(value, 78) as string[];
    pdf.text(label, 14, y);
    pdf.text(lines, 55, y);
    y += 7 + (lines.length - 1) * 5;
  }
  return new Response(pdf.output("arraybuffer"), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${receipt.orNo?.replace(/[^a-zA-Z0-9-]/g, "")}.pdf"`,
    "X-Content-Type-Options": "nosniff",
  } });
}
