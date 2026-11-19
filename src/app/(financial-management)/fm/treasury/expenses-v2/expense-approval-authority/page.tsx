import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NavUser } from "@/components/shared/app-sidebar/nav-user";
import { AuthorityOperations } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/workspaces/AuthorityOperations";
import { cookies } from "next/headers";
import { decodeJwtPayload } from "@/lib/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ExpenseApprovalAuthorityPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { section } = await searchParams;
  const initialSection = section === "finance" || section === "administration" ? section : "approvals";
  // Decoded values are presentation-only. Every data API independently verifies /auth/me and live grants.
  const token = (await cookies()).get("vos_access_token")?.value;
  const display = token ? decodeJwtPayload(token) : null;
  const headerUser = { name: [display?.FirstName, display?.LastName].filter(Boolean).join(" ") || "User", email: typeof display?.email === "string" ? display.email : "", avatar: "/avatars/shadcn.jpg" };
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <header className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-3 shadow-sm sm:h-16 sm:px-4">
      <div className="flex min-w-0 items-center gap-2"><SidebarTrigger className="-ml-1 shrink-0" /><Separator orientation="vertical" className="mr-2 hidden data-[orientation=vertical]:h-4 sm:block" />
        <Breadcrumb><BreadcrumbList><BreadcrumbItem className="hidden lg:block"><BreadcrumbLink href="/fm">FM</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator className="hidden lg:block" /><BreadcrumbItem className="hidden lg:block">Treasury</BreadcrumbItem><BreadcrumbSeparator className="hidden lg:block" /><BreadcrumbItem className="hidden md:block">Expenses V2</BreadcrumbItem><BreadcrumbSeparator className="hidden md:block" /><BreadcrumbItem><BreadcrumbPage className="max-w-[48vw] truncate sm:max-w-none">Expense Approval Authority</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>
      </div><div className="shrink-0"><NavUser user={headerUser} /></div>
    </header><div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden"><AuthorityOperations key={initialSection} initialSection={initialSection} /></div>
  </div>;
}
