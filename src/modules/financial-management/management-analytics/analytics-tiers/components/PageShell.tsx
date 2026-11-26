import Link from "next/link";
import { Fragment } from "react";
import { cookies } from "next/headers";

import { ArrowLeft } from "lucide-react";

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

const COOKIE_NAME = "vos_access_token";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function pickString(obj: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function headerUserFromToken(token: string | null | undefined) {
  const payload = token ? decodeJwtPayload(token) : null;
  const first = pickString(payload, ["Firstname", "FirstName", "firstName", "firstname", "first_name"]);
  const last = pickString(payload, ["LastName", "Lastname", "lastName", "lastname", "last_name"]);
  const email = pickString(payload, ["email", "Email"]);
  return {
    name: [first, last].filter(Boolean).join(" ") || email || "User",
    email,
    avatar: "/avatars/shadcn.jpg",
  };
}

/**
 * App chrome for every Management Analytics page.
 *
 * Each loan module duplicates this file rather than importing across modules, which is the
 * house rule for this tree: a module carries the kernel it needs.
 */
export type PageParent = { label: string; href: string };

export async function PageShell({
  title,
  parent,
  children,
}: {
  title: string;
  /** When set, the page is a view inside a module rather than a module of its own. */
  parent?: PageParent;
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const user = headerUserFromToken(cookieStore.get(COOKIE_NAME)?.value);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-2 overflow-hidden border-b bg-background shadow-sm sm:h-16">
        <div className="flex h-full min-w-0 items-center gap-2 overflow-hidden px-3 sm:px-4">
          <SidebarTrigger className="-ml-1 shrink-0" />
          <Separator orientation="vertical" className="mr-2 hidden shrink-0 data-[orientation=vertical]:h-4 sm:block" />
          <div className="min-w-0 overflow-hidden">
            <Breadcrumb>
              <BreadcrumbList className="min-w-0 overflow-hidden">
                <BreadcrumbItem className="hidden shrink-0 md:block">
                  <BreadcrumbLink href="#">FM</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                <BreadcrumbItem className="hidden shrink-0 md:block">
                  <BreadcrumbLink href="/fm/management-analytics/analytics-overview">Management Analytics</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                {parent ? (
                  <Fragment>
                    <BreadcrumbItem className="hidden shrink-0 md:block">
                      <BreadcrumbLink href={parent.href}>{parent.label}</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator className="hidden shrink-0 md:block" />
                  </Fragment>
                ) : null}
                <BreadcrumbItem className="min-w-0 overflow-hidden">
                  <BreadcrumbPage className="max-w-full truncate md:max-w-none">{title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
        <div className="flex h-full max-w-[48vw] shrink-0 items-center overflow-hidden px-2 sm:max-w-none sm:px-4">
          <NavUser user={user} />
        </div>
      </header>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4">
        {parent ? (
          <Link
            href={parent.href}
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Back to {parent.label}
          </Link>
        ) : null}
        {children}
      </main>
    </div>
  );
}
