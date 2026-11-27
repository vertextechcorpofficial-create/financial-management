import { resolveLguAdminAccess } from "@/modules/financial-management/lgu-asset-management-system/system-admin/services/lguAdmin";
import { LguSystemAdminScreen } from "@/modules/financial-management/lgu-asset-management-system/system-admin/components/LguSystemAdminScreen";

export const dynamic = "force-dynamic";

export default async function Page() {
  const access = await resolveLguAdminAccess();
  if (!access.systemAdmin) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-6">
        <h1 className="text-2xl font-semibold tracking-tight">LGU Asset Management, System Admin</h1>
        <div className="rounded-md border border-dashed p-6 text-sm">
          <div className="font-medium">This screen is not available to your role.</div>
          <p className="mt-1 text-muted-foreground">Only the System Admin manages the LGU asset classes, conditions and offices.</p>
        </div>
      </div>
    );
  }
  return <LguSystemAdminScreen email={access.email} />;
}
