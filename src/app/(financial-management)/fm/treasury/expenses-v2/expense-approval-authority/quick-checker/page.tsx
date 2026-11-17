import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NavUser } from "@/components/shared/app-sidebar/nav-user";
import { QuickAuthorityChecker } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-authority/components/QuickAuthorityChecker";
import { cookies } from "next/headers";
import { decodeJwtPayload } from "@/lib/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Standalone, read-only route. Page middleware protects the Expenses V2 subsystem. */
export default async function QuickAuthorityCheckerPage() {
  const token = (await cookies()).get("vos_access_token")?.value;
  const display = token ? decodeJwtPayload(token) : null;
  const headerUser = { name: [display?.FirstName, display?.LastName].filter(Boolean).join(" ") || "User",
    email: typeof display?.email === "string" ? display.email : "", avatar: "/avatars/shadcn.jpg" };
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <header className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-3 shadow-sm sm:h-16 sm:px-4">
      <div className="flex min-w-0 items-center gap-2"><SidebarTrigger className="-ml-1 shrink-0" /><Separator orientation="vertical" className="mr-2 hidden data-[orientation=vertical]:h-4 sm:block" />
        <Breadcrumb><BreadcrumbList><BreadcrumbItem className="hidden lg:block"><BreadcrumbLink href="/fm">FM</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden lg:block" /><BreadcrumbItem className="hidden lg:block">Treasury</BreadcrumbItem><BreadcrumbSeparator className="hidden lg:block" /><BreadcrumbItem className="hidden md:block">Expenses V2</BreadcrumbItem><BreadcrumbSeparator className="hidden md:block" /><BreadcrumbItem><BreadcrumbPage>Quick authority checker</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
      </div><div className="shrink-0"><NavUser user={headerUser} /></div>
    </header>
    <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5"><div className="mx-auto max-w-5xl space-y-5">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Expense Approval Authority · standalone tool</p><h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Quick Authority Checker</h1><p className="mt-1 text-sm text-muted-foreground">Preview minimum monetary authority using the proposed memo reference matrix.</p></div>
      <QuickAuthorityChecker />
      <p className="text-xs text-muted-foreground">The existing Evaluate Policy tab is unchanged. This separate route does not load a persisted policy and makes no API or database requests.</p>
    </div></main>
  </div>;
}
