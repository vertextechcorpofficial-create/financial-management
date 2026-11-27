import { NextResponse } from "next/server";
import {
  deactivateLguRole,
  listAccountsAndRoles,
  listLguReference,
  resolveLguAdminAccess,
  saveLguReference,
  setLguReferenceStatus,
  deleteLguReference,
  saveLguRole,
} from "@/modules/financial-management/lgu-asset-management-system/system-admin/services/lguAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Table 5: the LGU lists and the LGU roles belong to the System Admin, so every method asks for it. */
export async function GET(req: Request) {
  try {
    const access = await resolveLguAdminAccess();
    if (!access.systemAdmin) {
      return NextResponse.json({ message: "Only the System Admin manages the LGU lists and roles." }, { status: 403 });
    }
    const view = new URL(req.url).searchParams.get("view");
    return NextResponse.json(view === "accounts" ? await listAccountsAndRoles() : await listLguReference());
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const access = await resolveLguAdminAccess();
    if (!access.systemAdmin) {
      return NextResponse.json({ message: "Only the System Admin manages the LGU lists and roles." }, { status: 403 });
    }
    const body = await req.json();
    const kind = String(body?.kind ?? "");

    if (kind === "role") {
      const saved = await saveLguRole({
        id: body?.id == null || body?.id === "" ? null : Number(body.id),
        email: String(body?.email ?? ""),
        role: String(body?.role ?? ""),
      });
      return NextResponse.json(saved, { status: 201 });
    }
    if (kind === "role-off") {
      return NextResponse.json(await deactivateLguRole(Number(body?.id ?? 0)), { status: 200 });
    }
    if (kind === "reference-retire" || kind === "reference-restore") {
      await setLguReferenceStatus(
        String(body?.list ?? ""),
        Number(body?.id ?? 0),
        kind === "reference-retire" ? "inactive" : "active"
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }
    if (kind === "reference-delete") {
      await deleteLguReference(String(body?.list ?? ""), Number(body?.id ?? 0));
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const saved = await saveLguReference({
      kind,
      id: body?.id == null || body?.id === "" ? null : Number(body.id),
      values: (body?.values ?? {}) as Record<string, string>,
    });
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    return NextResponse.json({ message: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
