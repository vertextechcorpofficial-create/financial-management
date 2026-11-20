import DividendsModule from "@/modules/financial-management/cooperative/console/dividends/DividendsModule";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function CooperativeYearEndDividendsPage() {
  await requireCooperativePage("year-end-dividends");
  return <DividendsModule />;
}
