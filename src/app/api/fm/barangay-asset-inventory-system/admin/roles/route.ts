import { NextResponse } from "next/server";
import { deactivateRole, listRoles, listUsers, saveRole } from "@/modules/financial-management/barangay-asset-inventory-system/admin/services/brgyAdmin";

import { AccessError, requirePermission, resolveAccess } from "@/modules/financial-management/barangay-asset-inventory-system/shared/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Table 5: managing users and lists is the System Admin's job, so every method asks for it. */
function fail(err: unknown, status = 400) {
  if (err instanceof AccessError) return NextResponse.json({ message: err.message }, { status: err.status });
  return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status });
}

export async function GET() {
  try {
    const access = await resolveAccess();
    requirePermission(access, "users", "manage user roles");
    const [users, roles] = await Promise.all([listUsers(), listRoles()]);
    return NextResponse.json({ users, roles });
  } catch (err) {
    return fail(err, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const access = await resolveAccess();
    requirePermission(access, "users", "manage user roles");
    const row = await saveRole({
      email: String(body?.email ?? ""),
      role: String(body?.role ?? ""),
      barangayId: body?.barangayId == null || body?.barangayId === "" ? null : Number(body.barangayId),
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}

/** Section 2 and Table 5: a role is turned inactive, never deleted, so the audit trail survives. */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const access = await resolveAccess();
    requirePermission(access, "users", "manage user roles");
    await deactivateRole(Number(body?.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
