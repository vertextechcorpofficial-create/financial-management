import TransactionsModule from "@/modules/financial-management/cooperative/console/transactions/TransactionsModule";
import { CooperativePageHeader } from "@/modules/financial-management/cooperative/components/CooperativePageHeader";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function CooperativeTransactionsPage() {
  const { actorName, actorEmail } = await requireCooperativePage("transactions");

  return (
    <>
      <CooperativePageHeader workspace="transactions" actorName={actorName} actorEmail={actorEmail} />
      <TransactionsModule />
    </>
  );
}
