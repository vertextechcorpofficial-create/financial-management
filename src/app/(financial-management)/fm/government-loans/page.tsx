import { redirect } from "next/navigation";
import { requireGovernmentLoansPage } from "@/modules/financial-management/government-loans/server/page-access";

export default async function GovernmentLoansLandingPage() {
  const { workspaces } = await requireGovernmentLoansPage();
  redirect(workspaces[0].path);
}
