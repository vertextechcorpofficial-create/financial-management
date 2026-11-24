import { NextResponse } from "next/server";
import {
  fetchCustodyList,
  issueAsset,
  returnAsset,
  transferAsset,
} from "@/modules/financial-management/lgu-asset-management-system/custody/services/assetCustody";
import type {
  CustodyReturnInput,
  CustodyTransferInput,
} from "@/modules/financial-management/lgu-asset-management-system/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ message }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? undefined;
    const officeId = searchParams.get("officeId");
    const onlyWithOfficer = searchParams.get("onlyWithOfficer") === "1";
    const data = await fetchCustodyList({
      q,
      officeId: officeId ? Number(officeId) : null,
      onlyWithOfficer,
    });
    return NextResponse.json(data);
  } catch (err) {
    return fail(err);
  }
}

type Body = (CustodyTransferInput | CustodyReturnInput) & { action?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.assetId) return NextResponse.json({ message: "assetId is required" }, { status: 400 });

    if (body.action === "issue") {
      return NextResponse.json(await issueAsset(body as CustodyTransferInput), { status: 201 });
    }
    if (body.action === "transfer") {
      return NextResponse.json(await transferAsset(body as CustodyTransferInput), { status: 201 });
    }
    if (body.action === "return") {
      return NextResponse.json(await returnAsset(body as CustodyReturnInput), { status: 201 });
    }
    return NextResponse.json({ message: "action must be issue, transfer or return" }, { status: 400 });
  } catch (err) {
    return fail(err);
  }
}
