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
import ReportsModule from "@/modules/financial-management/asset-management/reports/ReportsModule";

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
    "first_name",
    "given_name",
  ]);
  const last = pickString(payload, [
    "Lastname",
    "LastName",
    "lastName",
    "last_name",
    "family_name",
  ]);
  const email = pickString(payload, ["Email", "email", "user_email"]);
  const role = pickString(payload, ["Role", "role", "role_name", "user_role"]);

  const fullName = `${first} ${last}`.trim();

  return {
    name: fullName || "Asset Manager",
    email: email || "user@financial.local",
    avatar: "",
    role: role || "Accounting Staff",
  };
}

export default async function AssetReportsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  const headerUser = buildHeaderUserFromToken(token);

  return (
    <div className="flex flex-col w-full min-h-screen">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 justify-between bg-background">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/fm/asset-management/asset-summary">
                  Asset Management
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Reports</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex items-center gap-4">
          <NavUser user={headerUser} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <ReportsModule />
      </div>
    </div>
  );
}
