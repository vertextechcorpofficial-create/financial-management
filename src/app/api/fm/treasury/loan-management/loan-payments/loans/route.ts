import { listLoanOptions } from "@/modules/financial-management/treasury/loan-management/loan-payments/services/payments.service";

import { handleRouteError, ok } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The loans the payment dialog may pick from. */
export async function GET() {
  try {
    return ok({ loans: await listLoanOptions() });
  } catch (error) {
    return handleRouteError(error, "GET loan options", "The loans could not be read.");
  }
}
