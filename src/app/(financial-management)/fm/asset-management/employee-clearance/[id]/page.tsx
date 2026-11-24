import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NavUser } from "@/components/shared/app-sidebar/nav-user";
import { cookies } from "next/headers";
import EmployeeClearanceDetailPage from "@/modules/financial-management/asset-management/employee-clearance/EmployeeClearanceDetailPage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "vos_access_token";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;

    const p = parts[1];
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);

    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function pickString(obj: Record<string, unknown> | null | undefined, keys: string[]): string {
  for (const k of keys) {
    const v = obj ? obj[k] : undefined;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function buildHeaderUserFromToken(token: string | null | undefined) {
  const payload = token ? decodeJwtPayload(token) : null;

  const first = pickString(payload, [
    "Firstname",
    "FirstName",
    "firstName",
    "firstname",
    "first_name",
  ]);
  const last = pickString(payload, [
    "LastName",
    "Lastname",
    "lastName",
    "lastname",
    "last_name",
  ]);
  const email = pickString(payload, ["email", "Email"]);
  const name = [first, last].filter(Boolean).join(" ") || email || "User";

  return {
    name,
    email: email || "",
    avatar: "",
    role: pickString(payload, ["role", "Role"]) || "Member",
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const headerUser = buildHeaderUserFromToken(token);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top Header */}
      <header className="flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 border-b px-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/fm/asset-management/employee-clearance">
                  Employee clearance
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Clearance Process</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        <div className="flex items-center gap-3">
          <NavUser user={headerUser} />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <EmployeeClearanceDetailPage employeeId={id} />
      </main>
    </div>
  );
}
