import { defaultPeriod, currentLock } from "@/modules/financial-management/treasury/loan-management/loan-register/reconciliation/services/reconciliation.service";
import { listLoanOptions } from "@/modules/financial-management/treasury/loan-management/loan-register/reconciliation/services/statements.service";
import { phtToday } from "@/modules/financial-management/treasury/loan-management/loan-register/reconciliation/pht";

import { handleRouteError, ok } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything the page needs before the user types: the loan list, the lock, today's period. */
export async function GET() {
  try {
    const [loans, lock] = await Promise.all([listLoanOptions(), currentLock()]);
    return ok({
      loans,
      lockedThrough: lock?.locked_through ?? null,
      lockNote: lock?.note ?? null,
      today: phtToday(),
      defaultPeriod: defaultPeriod(),
    });
  } catch (error) {
    return handleRouteError(error, "GET loan reconciliation context", "The loans could not be read.");
  }
}
