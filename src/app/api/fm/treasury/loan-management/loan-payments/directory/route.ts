import { NextRequest } from "next/server";

import { loanDirectoryFilterSchema } from "@/modules/financial-management/treasury/loan-management/loan-payments/schemas";
import { listLoanDirectory } from "@/modules/financial-management/treasury/loan-management/loan-payments/services/payments.service";

import { fail, handleRouteError, ok } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The landing list: every loan, with the amount it still owes today on each row. */
export async function GET(request: NextRequest) {
  try {
    const parsed = loanDirectoryFilterSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return fail("Some filters need attention.", 400);

    return ok(await listLoanDirectory(parsed.data));
  } catch (error) {
    return handleRouteError(error, "GET loan payment directory", "The loans could not be read.");
  }
}
