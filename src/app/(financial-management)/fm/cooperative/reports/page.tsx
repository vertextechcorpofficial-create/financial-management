import ReportsModule from "@/modules/financial-management/cooperative/console/reports/ReportsModule";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function CooperativeReportsPage() {
  await requireCooperativePage("reports");
  return <ReportsModule />;
}
