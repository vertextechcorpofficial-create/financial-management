import DividendsModule from "@/modules/financial-management/cooperative/console/dividends/DividendsModule";
import { CooperativePageHeader } from "@/modules/financial-management/cooperative/components/CooperativePageHeader";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";
import { todayManila } from "@/modules/financial-management/cooperative/server/member-read";

export default async function CooperativeYearEndDividendsPage() {
  const { actorName, actorEmail } = await requireCooperativePage("year-end-dividends");

  return (
    <>
      <CooperativePageHeader workspace="year-end-dividends" actorName={actorName} actorEmail={actorEmail} />
      <DividendsModule currentYear={Number(todayManila().slice(0, 4))} />
    </>
  );
}
