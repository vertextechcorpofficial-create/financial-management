import { NextResponse } from "next/server";
import { getCooperativeAccess } from "@/modules/financial-management/cooperative/server/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getCooperativeAccess();
  const response = access.ok
    ? NextResponse.json({ workspaces: access.workspaces })
    : NextResponse.json({ message: access.message }, { status: access.status });

  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  for (const cookie of access.setCookies) response.headers.append("Set-Cookie", cookie);
  return response;
}
