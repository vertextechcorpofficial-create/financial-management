import { NavUser } from "@/components/shared/app-sidebar/nav-user";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { requireGovernmentLoansPage } from "../server/page-access";
import { readDeclaredTransferEmployee } from "../server/onboarding-exits";
import {
  GOVERNMENT_LOANS_TABS,
  GOVERNMENT_LOANS_WORKSPACES,
  type GovernmentLoansWorkspaceKey,
} from "../workspaces";
import { GovernmentLoansWorkspaceShell } from "./GovernmentLoansWorkspaceShell";

export async function GovernmentLoansWorkspacePage({ workspace, transferEmployeeId, tab, defaultTab }: {
  workspace: GovernmentLoansWorkspaceKey; transferEmployeeId?: number; tab?: string | string[]; defaultTab?: string;
}) {
  const { actorId, actorName, actorEmail, workspaces } = await requireGovernmentLoansPage(workspace);
  const definition = GOVERNMENT_LOANS_WORKSPACES.find(entry => entry.key === workspace);
  if (!definition) return null;
  const transferEmployee = workspace === "loan-applications" && transferEmployeeId
    ? await readDeclaredTransferEmployee(transferEmployeeId) : undefined;
  const requestedTab = typeof tab === "string" && tab ? tab : defaultTab;
  const initialTab = GOVERNMENT_LOANS_TABS[workspace].find(item => item.key === requestedTab)?.key;
  const canOpenSetup = workspaces.some(item => item.key === "month-end-close");

  return <>
    <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background shadow-sm sm:h-16">
      <div className="flex min-w-0 items-center gap-2 px-3 sm:px-4">
        <SidebarTrigger className="-ml-1 shrink-0" />
        <Separator orientation="vertical" className="mr-2 hidden shrink-0 data-[orientation=vertical]:h-4 sm:block" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap whitespace-nowrap">
            <BreadcrumbItem className="hidden shrink-0 md:block">
              <span>FM</span>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden shrink-0 md:block" />
            <BreadcrumbItem className="min-w-0"><span className="truncate">Government Loans</span></BreadcrumbItem>
            <BreadcrumbSeparator className="shrink-0" />
            <BreadcrumbItem className="shrink-0"><BreadcrumbPage>{definition.title}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex max-w-[40vw] shrink-0 items-center overflow-hidden px-2 sm:px-4">
        <NavUser user={{ name: actorName, email: actorEmail }} />
      </div>
    </header>
    <GovernmentLoansWorkspaceShell workspace={definition} tabs={GOVERNMENT_LOANS_TABS[workspace]} transferEmployee={transferEmployee}
      initialTab={initialTab} canOpenSetup={canOpenSetup}
      requestApplicant={workspace === "my-loans" ? { id: actorId, name: actorName } : undefined}
      reportActorId={workspace === "reports" ? actorId : undefined} />
  </>;
}
