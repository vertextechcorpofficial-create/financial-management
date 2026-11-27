import MembersModule from "@/modules/financial-management/cooperative/members/MembersModule";
import { CooperativePageHeader } from "@/modules/financial-management/cooperative/components/CooperativePageHeader";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function CooperativeMembersPage() {
  const { actorName, actorEmail } = await requireCooperativePage("members");

  return (
    <>
      <CooperativePageHeader workspace="members" actorName={actorName} actorEmail={actorEmail} />
      <MembersModule />
    </>
  );
}
