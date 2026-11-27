import PoliciesModule from "@/modules/financial-management/cooperative/policies/PoliciesModule";
import { CooperativePageHeader } from "@/modules/financial-management/cooperative/components/CooperativePageHeader";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function PoliciesPage() {
  const { actorName, actorEmail } = await requireCooperativePage("policies");

  return (
    <>
      <CooperativePageHeader workspace="policies" actorName={actorName} actorEmail={actorEmail} />
      <PoliciesModule />
    </>
  );
}
