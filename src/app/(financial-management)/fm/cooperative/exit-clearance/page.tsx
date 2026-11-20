import ClearanceModule from "@/modules/financial-management/cooperative/console/clearance/ClearanceModule";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function CooperativeExitClearancePage() {
  await requireCooperativePage("exit-clearance");
  return <ClearanceModule />;
}
