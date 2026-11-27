import { NextResponse } from "next/server";
import {
  exportAssets,
  fetchLookups,
} from "@/modules/financial-management/lgu-asset-management-system/registry/services/assetRegistry";
import { buildRegistryWorkbook } from "@/modules/financial-management/lgu-asset-management-system/shared/assetWorkbook";
import type { AssetRecordStatus, AssetSortKey } from "@/modules/financial-management/lgu-asset-management-system/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const [assets, lookups] = await Promise.all([
      exportAssets({
        q: searchParams.get("q") ?? undefined,
        classId: searchParams.get("classId") ? Number(searchParams.get("classId")) : null,
        officeId: searchParams.get("officeId") ? Number(searchParams.get("officeId")) : null,
        recordStatus: (searchParams.get("recordStatus") as AssetRecordStatus | "all" | null) ?? null,
        sort: (searchParams.get("sort") as AssetSortKey | undefined) ?? undefined,
        dir: searchParams.get("dir") === "desc" ? "desc" : "asc",
      }),
      fetchLookups(),
    ]);

    const buffer = await buildRegistryWorkbook({
      assets,
      classes: lookups.classes.map((c) => ({ id: c.id, name: c.name })),
      offices: lookups.offices,
      conditions: lookups.conditions.map((c) => ({ id: c.id, name: c.name })),
      asOf: new Date().toISOString().slice(0, 10),
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="property-register-' +
          (searchParams.get("recordStatus") ?? "active") +
          "-" +
          new Date().toISOString().slice(0, 10) +
          '.xlsx"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}
