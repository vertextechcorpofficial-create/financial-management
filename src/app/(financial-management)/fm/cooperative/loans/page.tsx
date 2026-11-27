import LoansModule from "@/modules/financial-management/cooperative/loans/LoansModule";
import { CooperativePageHeader } from "@/modules/financial-management/cooperative/components/CooperativePageHeader";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function CooperativeLoansPage() {
  const { actorName, actorEmail } = await requireCooperativePage("loans");

  return (
    <>
      <CooperativePageHeader workspace="loans" actorName={actorName} actorEmail={actorEmail} />
      <LoansModule />
    </>
  );
}
