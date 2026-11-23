import TransactionsModule from "@/modules/financial-management/cooperative/console/transactions/TransactionsModule";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function CooperativeTransactionsPage() {
  await requireCooperativePage("transactions");
  return <TransactionsModule />;
}
