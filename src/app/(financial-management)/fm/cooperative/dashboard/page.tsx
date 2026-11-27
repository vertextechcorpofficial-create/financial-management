import DashboardModule from "@/modules/financial-management/cooperative/console/dashboard/DashboardModule";
import { CooperativePageHeader } from "@/modules/financial-management/cooperative/components/CooperativePageHeader";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function CooperativeDashboardPage() {
  const { actorName, actorEmail } = await requireCooperativePage("dashboard");

  return (
    <>
      <CooperativePageHeader workspace="dashboard" actorName={actorName} actorEmail={actorEmail} />
      <DashboardModule />
    </>
  );
}
