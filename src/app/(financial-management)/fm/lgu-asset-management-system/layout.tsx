import * as React from "react";
import { resolveLguAdminAccess } from "@/modules/financial-management/lgu-asset-management-system/system-admin/services/lguAdmin";

export const dynamic = "force-dynamic";

/**
 * The LGU property register is for the municipal office and the System Admin only. Until now the
 * platform menu grant was the only thing standing between an account and this module, so this
 * layout adds the check in code as well. It reads the session and the role table itself, because
 * the repo forbids imports between modules.
 */
export default async function LguLayout({ children }: { children: React.ReactNode }) {
  const access = await resolveLguAdminAccess();
  if (!access.canOpenModule) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-6">
        <h1 className="text-2xl font-semibold tracking-tight">LGU Asset Management</h1>
        <div className="rounded-md border border-dashed p-6 text-sm">
          <div className="font-medium">This module is not available to your account.</div>
          <p className="mt-1 text-muted-foreground">
            Only the Municipal Property and Accounting office and the System Admin manage LGU assets. Your account holds:{" "}
            {access.roles.length ? access.roles.join(", ") : "no role yet"}. Ask the System Admin if you need access.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
