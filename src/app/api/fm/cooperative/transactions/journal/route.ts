import { getTransactionJournal } from "@/modules/financial-management/cooperative/server/transaction-journal";
import { withLoans } from "../../loans/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withLoans(() => getTransactionJournal(new URL(request.url).searchParams), "transactions");
}
