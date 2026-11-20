import { NextResponse } from "next/server";
import { requireCooperativeWorkspace } from "@/modules/financial-management/cooperative/server/access";
import { isCooperativeDataReady } from "@/modules/financial-management/cooperative/server/directus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireCooperativeWorkspace("policies");
  let response: NextResponse;
  if (!access.ok) {
    response = NextResponse.json({ message: access.message }, { status: access.status });
  } else {
    const ready = await isCooperativeDataReady();
    response = ready
      ? NextResponse.json({ ready: true })
      : NextResponse.json({ message: "Cooperative data is temporarily unavailable." }, { status: 503 });
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  for (const cookie of access.setCookies) response.headers.append("Set-Cookie", cookie);
  return response;
}
