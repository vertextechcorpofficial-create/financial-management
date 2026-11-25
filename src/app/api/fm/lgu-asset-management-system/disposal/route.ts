import { NextResponse } from "next/server";
import {
  disposeAsset,
  fetchDisposalCandidates,
  fileIirup,
} from "@/modules/financial-management/lgu-asset-management-system/disposal/services/assetDisposal";
import type { DisposalInput } from "@/modules/financial-management/lgu-asset-management-system/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") ?? 1);
    const q = searchParams.get("q") ?? undefined;
    return NextResponse.json(await fetchDisposalCandidates({ page, q }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 500 });
  }
}

interface Body extends DisposalInput { action: "iirup" | "dispose" }

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.assetId) return NextResponse.json({ message: "assetId is required" }, { status: 400 });
    if (body.action === "iirup") return NextResponse.json(await fileIirup(body), { status: 201 });
    if (body.action === "dispose") return NextResponse.json(await disposeAsset(body), { status: 201 });
    return NextResponse.json({ message: "action must be iirup or dispose" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message }, { status: 409 });
  }
}
