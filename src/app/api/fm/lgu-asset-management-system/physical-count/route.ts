import { NextResponse } from "next/server";
import {
  createCountSession,
  fetchCountSessions,
} from "@/modules/financial-management/lgu-asset-management-system/physical-count/services/assetCount";
import type { CountSessionInput } from "@/modules/financial-management/lgu-asset-management-system/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : String(err);
  return NextResponse.json({ message }, { status });
}

export async function GET() {
  try {
    return NextResponse.json(await fetchCountSessions());
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as CountSessionInput;
    const detail = await createCountSession(body);
    return NextResponse.json(detail, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("scope") || message.includes("required") ? 400 : 500;
    return NextResponse.json({ message }, { status });
  }
}
