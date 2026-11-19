import { NextRequest } from "next/server";

import { loadContext } from "@/modules/financial-management/treasury/loan-management/loan-payments/services/payments.service";

import { fail, handleRouteError, ok, toId } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the record-payment dialog needs: the loan, its open installments, the accounts, a suggestion. */
export async function GET(request: NextRequest) {
  try {
    const loanId = toId(request.nextUrl.searchParams.get("loanId"));
    if (!loanId) return fail("Choose a loan first.", 400);

    const context = await loadContext(loanId);
    return ok(context);
  } catch (error) {
    return handleRouteError(error, "GET payment context", "That loan could not be read.");
  }
}
