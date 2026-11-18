import { NextResponse } from "next/server";
import { z } from "zod";
import { proxySpring } from "@/app/api/fm/financial-statements/adjusting-journal-entries/_spring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bankId = z.coerce.number().int().positive().max(2147483647);
const mapping = z.object({
  version: z.number().int().nonnegative(),
  companyId: z.number().int().positive().max(2147483647),
  glCoaId: z.number().int().positive().max(2147483647),
});
type RouteContext = { params: Promise<{ id: string }> };

async function forward(request: Request, context: RouteContext) {
  const id = bankId.safeParse((await context.params).id);
  if (!id.success) return NextResponse.json({ message: "Select a valid bank account." }, { status: 400 });

  const path = `/api/v1/treasury/bank-reconciliation/banks/${id.data}/configuration`;
  const reading = request.method === "GET";
  const init: RequestInit = { method: request.method, cache: "no-store" };
  if (!reading) {
    const parsed = mapping.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ message: "Choose a company and a Cash in Bank GL account." }, { status: 400 });
    }
    init.body = JSON.stringify(parsed.data);
  }

  const response = await proxySpring(reading ? `${path}?onboarding=true` : path, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const GET = forward;
export const PUT = forward;
