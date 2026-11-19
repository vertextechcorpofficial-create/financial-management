import PoliciesModule from "@/modules/financial-management/cooperative/policies/PoliciesModule";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function PoliciesPage() {
  await requireCooperativePage("policies");
  return <PoliciesModule />;
}
