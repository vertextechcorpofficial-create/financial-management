import { NextRequest } from "next/server";

import { loanHistoryFilterSchema } from "@/modules/financial-management/treasury/loan-management/loan-payments/schemas";
import { listLoanPaymentHistory } from "@/modules/financial-management/treasury/loan-management/loan-payments/services/payments.service";

import { fail, handleRouteError, ok } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One loan's payment history, filtered by the account the money came from and a date range. */
export async function GET(request: NextRequest) {
  try {
    const parsed = loanHistoryFilterSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!parsed.success) return fail("Some filters need attention.", 400);

    const { loanId, ...filters } = parsed.data;
    return ok({ rows: await listLoanPaymentHistory(loanId, filters) });
  } catch (error) {
    return handleRouteError(error, "GET loan payment history", "The payment history could not be read.");
  }
}
