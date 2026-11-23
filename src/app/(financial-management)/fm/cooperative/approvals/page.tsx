import Link from "next/link";
import { NavUser } from "@/components/shared/app-sidebar/nav-user";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import ApprovalsModule from "@/modules/financial-management/cooperative/approvals/ApprovalsModule";
import { requireCooperativePage } from "@/modules/financial-management/cooperative/server/page-access";

export default async function CooperativeApprovalsPage() {
  const { actorName, actorEmail } = await requireCooperativePage("approvals");

  return (
    <>
      <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background shadow-sm sm:h-16">
        <div className="flex min-w-0 items-center gap-2 px-3 sm:px-4">
          <SidebarTrigger className="-ml-1 shrink-0" />
          <Separator orientation="vertical" className="mr-2 hidden shrink-0 data-[orientation=vertical]:h-4 sm:block" />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap whitespace-nowrap">
              <BreadcrumbItem className="hidden shrink-0 md:block">
                <BreadcrumbLink asChild><Link href="/fm">FM</Link></BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden shrink-0 md:block" />
              <BreadcrumbItem className="min-w-0"><span className="truncate">Cooperative</span></BreadcrumbItem>
              <BreadcrumbSeparator className="shrink-0" />
              <BreadcrumbItem className="shrink-0"><BreadcrumbPage>Approvals</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex max-w-[40vw] shrink-0 items-center overflow-hidden px-2 sm:px-4">
          <NavUser user={{ name: actorName, email: actorEmail }} />
        </div>
      </header>
      <ApprovalsModule />
    </>
  );
}
