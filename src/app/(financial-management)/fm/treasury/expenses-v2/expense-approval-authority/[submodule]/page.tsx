import { notFound } from "next/navigation";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NavUser } from "@/components/shared/app-sidebar/nav-user";
import { cookies } from "next/headers";
import { decodeJwtPayload } from "@/lib/auth-utils";
import { ExpenseApprovalAuthorityModule } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pages: Record<string, { title: string; tab: string }> = {
  overview: { title: "Overview", tab: "overview" },
  "authority-matrix": { title: "Authority Matrix", tab: "matrix" },
  delegations: { title: "Delegations", tab: "delegations" },
  evaluation: { title: "Evaluate Policy", tab: "evaluation" },
  exceptions: { title: "Exceptions", tab: "exceptions" },
  "audit-history": { title: "Audit History", tab: "audit" },
  "user-access": { title: "User Access", tab: "access" },
};

export default async function ExpenseAuthoritySubmodulePage({ params }: { params: Promise<{ submodule: string }> }) {
  const { submodule } = await params;
  const page = pages[submodule];
  if (!page) notFound();
  const token = (await cookies()).get("vos_access_token")?.value;
  const display = token ? decodeJwtPayload(token) : null;
  const headerUser = { name: [display?.FirstName, display?.LastName].filter(Boolean).join(" ") || "User", email: typeof display?.email === "string" ? display.email : "", avatar: "/avatars/shadcn.jpg" };
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <header className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-3 shadow-sm sm:h-16 sm:px-4">
      <div className="flex min-w-0 items-center gap-2"><SidebarTrigger className="-ml-1 shrink-0" /><Separator orientation="vertical" className="mr-2 hidden data-[orientation=vertical]:h-4 sm:block" />
        <Breadcrumb><BreadcrumbList><BreadcrumbItem className="hidden lg:block"><BreadcrumbLink href="/fm">FM</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden lg:block" /><BreadcrumbItem className="hidden lg:block">Treasury</BreadcrumbItem><BreadcrumbSeparator className="hidden lg:block" /><BreadcrumbItem className="hidden md:block">Expenses V2</BreadcrumbItem><BreadcrumbSeparator className="hidden md:block" /><BreadcrumbItem><BreadcrumbLink href="/fm/treasury/expenses-v2/expense-approval-authority">Expense Approval Authority</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>{page.title}</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
      </div><div className="shrink-0"><NavUser user={headerUser} /></div>
    </header>
    <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5"><ExpenseApprovalAuthorityModule initialTab={page.tab} enforceInitialTab /></main>
  </div>;
}
