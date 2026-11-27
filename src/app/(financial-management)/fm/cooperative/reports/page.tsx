import ReportsModule from "@/modules/financial-management/cooperative/console/reports/ReportsModule";
import { CooperativePageHeader } from "@/modules/financial-management/cooperative/components/CooperativePageHeader";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function CooperativeReportsPage() {
  const { actorName, actorEmail } = await requireCooperativePage("reports");

  return (
    <>
      <CooperativePageHeader workspace="reports" actorName={actorName} actorEmail={actorEmail} />
      <ReportsModule />
    </>
  );
}
