import ClearanceModule from "@/modules/financial-management/cooperative/console/clearance/ClearanceModule";
import { CooperativePageHeader } from "@/modules/financial-management/cooperative/components/CooperativePageHeader";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function CooperativeExitClearancePage() {
  const { actorName, actorEmail } = await requireCooperativePage("exit-clearance");

  return (
    <>
      <CooperativePageHeader workspace="exit-clearance" actorName={actorName} actorEmail={actorEmail} />
      <ClearanceModule />
    </>
  );
}
