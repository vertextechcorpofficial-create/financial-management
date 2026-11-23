import type { NextRequest } from "next/server";
import { handleAuthority } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  return handleAuthority(request, (await params).resource);
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  return handleAuthority(request, (await params).resource);
}
