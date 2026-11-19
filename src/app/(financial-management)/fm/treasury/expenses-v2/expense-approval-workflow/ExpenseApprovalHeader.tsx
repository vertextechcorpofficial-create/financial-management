import { cookies } from "next/headers";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NavUser } from "@/components/shared/app-sidebar/nav-user";

function headerUser(token: string | undefined) {
  try {
    const encoded = token?.split(".")[1];
    if (!encoded) throw new Error("Missing session token");
    const payload = JSON.parse(Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, unknown>;
    const pick = (...keys: string[]) => keys.map(key => payload[key]).find(value => typeof value === "string" && value.trim()) as string | undefined;
    const email = pick("email", "Email") || "";
    const name = [pick("Firstname", "FirstName", "firstName", "firstname", "first_name"), pick("LastName", "Lastname", "lastName", "lastname", "last_name")].filter(Boolean).join(" ") || email || "User";
    return { name, email, avatar: "/avatars/shadcn.jpg" };
  } catch {
    return { name: "User", email: "", avatar: "/avatars/shadcn.jpg" };
  }
}

export async function ExpenseApprovalHeader() {
  const session = await cookies();
  const user = headerUser(session.get("vos_access_token")?.value);
  return (
    <header className="relative z-10 flex h-14 shrink-0 items-center justify-between border-b bg-background shadow-sm sm:h-16">
      <div className="flex h-full min-w-0 items-center gap-2 overflow-hidden px-3 sm:px-4">
        <SidebarTrigger className="-ml-1 shrink-0" />
        <Separator orientation="vertical" className="mr-2 hidden h-4 shrink-0 sm:block" />
        <div className="min-w-0 overflow-hidden">
          <Breadcrumb>
            <BreadcrumbList className="min-w-0 overflow-hidden">
              <BreadcrumbItem className="hidden shrink-0 md:block"><BreadcrumbLink href="#">FM</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator className="hidden shrink-0 md:block" />
              <BreadcrumbItem className="hidden shrink-0 md:block"><BreadcrumbLink href="#">Treasury</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator className="hidden shrink-0 md:block" />
              <BreadcrumbItem className="hidden shrink-0 md:block"><BreadcrumbLink href="#">Expenses V2</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator className="hidden shrink-0 md:block" />
              <BreadcrumbItem className="min-w-0 overflow-hidden"><BreadcrumbPage className="max-w-[48vw] truncate sm:max-w-[56vw] md:max-w-none">Expense Approval Authority</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </div>
      <div className="flex h-full max-w-[48vw] shrink-0 items-center overflow-hidden px-2 sm:max-w-none sm:px-4">
        <NavUser user={user} subsystemSlug="fm" />
      </div>
    </header>
  );
}
