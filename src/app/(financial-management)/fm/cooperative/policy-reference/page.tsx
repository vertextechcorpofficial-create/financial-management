import { redirect } from "next/navigation";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";
import { COOPERATIVE_POLICIES } from "@/modules/financial-management/cooperative/workspaces";

export default async function PolicyReferenceRedirectPage() {
  await requireCooperativePage(COOPERATIVE_POLICIES.key);
  redirect(COOPERATIVE_POLICIES.path);
}
