import { getSavingsDepositReceipt } from "@/modules/financial-management/cooperative/server/savings-deposits";
import { cooperativeReceiptPdf } from "../../../../_receipt-pdf";
import { withLoans } from "../../../../loans/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLoans(async () => {
    const receipt = await getSavingsDepositReceipt(Number((await params).id));
    return cooperativeReceiptPdf(receipt.orNo, [
      ["Member", `${receipt.memberName} (${receipt.employeeNo})`],
      ["Receipt date", receipt.receiptDate], ["Posting date", receipt.businessDate],
      ["Journal", receipt.journalNo], ["Channel", "Over the counter"], ["Cashier", receipt.cashier],
      ...(receipt.reference ? [["Reference", receipt.reference]] as [string, string][] : []),
      ["Savings deposit", `PHP ${receipt.amount}`], ["Total received", `PHP ${receipt.amount}`],
    ]);
  }, "transactions");
}
