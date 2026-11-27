import ApprovalsModule from "@/modules/financial-management/cooperative/approvals/ApprovalsModule";
import { CooperativePageHeader } from "@/modules/financial-management/cooperative/components/CooperativePageHeader";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function CooperativeApprovalsPage() {
  const { actorName, actorEmail } = await requireCooperativePage("approvals");

  return (
    <>
      <CooperativePageHeader workspace="approvals" actorName={actorName} actorEmail={actorEmail} />
      <ApprovalsModule />
    </>
  );
}
