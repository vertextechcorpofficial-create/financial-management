import { listLoanPaymentJournal, listPayableLoans } from "@/modules/financial-management/cooperative/server/loan-payment-register";
import { withLoans } from "../../loans/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return withLoans(() => params.get("select") === "loans" ? listPayableLoans(params) : listLoanPaymentJournal(params), "transactions");
}
