import DividendsModule from "@/modules/financial-management/cooperative/console/dividends/DividendsModule";
import { todayManila } from "@/modules/financial-management/cooperative/server/member-read";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function CooperativeYearEndDividendsPage() {
  await requireCooperativePage("year-end-dividends");
  return <DividendsModule currentYear={Number(todayManila().slice(0, 4))} />;
}
