import { NextResponse } from "next/server";

import { periodKeySchema } from "@/modules/financial-management/taxation/payments-2307/schemas";
import { loadLockTrail } from "@/modules/financial-management/taxation/payments-2307/services/locks.service";
import { fail, handleRouteError, ok } from "@/modules/financial-management/taxation/payments-2307/services/responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const companyId = Number(url.searchParams.get("companyId"));
    const year = Number(url.searchParams.get("year"));
    const periodKey = periodKeySchema.safeParse(url.searchParams.get("periodKey") ?? "");

    if (!Number.isInteger(companyId) || companyId <= 0 || !Number.isInteger(year) || year < 2000) {
      return fail("Send the company and the tax year.", 400);
    }
    if (!periodKey.success) return fail("Send a filing period.", 400);

    return ok({ entries: await loadLockTrail(companyId, year, periodKey.data) });
  } catch (error) {
    return handleRouteError("GET lock trail", error);
  }
}
