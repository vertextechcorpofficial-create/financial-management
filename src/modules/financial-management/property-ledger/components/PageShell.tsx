import { cookies } from "next/headers";
import { COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";
import { PropertyLedgerBreadcrumb } from "./PageBreadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { NavUser } from "@/components/shared/app-sidebar/nav-user";

export async function PropertyLedgerShell({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const claims = token ? decodeJwtPayload(token) : null;
  const pick = (keys: string[]) => keys.map(k => claims?.[k]).find(v => typeof v === "string" && v.trim()) as string | undefined;
  const email = pick(["email", "Email"]) || "";
  const name = [pick(["FirstName", "Firstname", "firstName", "firstname", "first_name"]), pick(["LastName", "Lastname", "lastName", "lastname", "last_name"])].filter(Boolean).join(" ") || email || "User";
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <header className="relative z-10 flex h-14 shrink-0 items-center justify-between overflow-hidden border-b bg-background shadow-sm sm:h-16">
      <div className="flex h-full min-w-0 flex-1 items-center gap-2 overflow-hidden px-3 sm:px-4"><SidebarTrigger className="-ml-1 shrink-0" /><Separator orientation="vertical" className="mr-2 hidden h-4 sm:block" />
        <PropertyLedgerBreadcrumb />
      </div><div className="max-w-[48vw] shrink-0 overflow-hidden px-2 sm:max-w-none sm:px-4"><NavUser user={{ name, email }} /></div>
    </header>
    <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
  </div>;
}
