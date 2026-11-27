import { NextResponse } from "next/server";
import { can, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The screen asks who it is talking to, so a barangay user is not offered another barangay's data. */
export async function GET() {
  const access = await resolveAccess();
  return NextResponse.json({
    role: access.role,
    roles: access.roles,
    email: access.email,
    barangayId: access.barangayId,
    userId: access.userId,
    authDisabled: access.authDisabled,
    unconfigured: access.unconfigured === true,
    permissions: {
      view: can(access, "view"),
      register: can(access, "register"),
      assign: can(access, "assign"),
      condition: can(access, "condition"),
      disposeRequest: can(access, "disposeRequest"),
      disposeApprove: can(access, "disposeApprove"),
      count: can(access, "count"),
      reports: can(access, "reports"),
      users: can(access, "users"),
    },
  });
}
