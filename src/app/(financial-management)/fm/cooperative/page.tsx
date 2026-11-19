import { redirect } from "next/navigation";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function CooperativeLandingPage() {
  const { workspaces } = await requireCooperativePage();
  redirect(workspaces[0].path);
}
