import { listBankNames } from "@/modules/financial-management/treasury/loan-management/loan-register/services/register.service";

import { handleRouteError, ok } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lenders the onboarding registry already knows, for the new-loan form. */
export async function GET() {
  try {
    return ok({ banks: await listBankNames() });
  } catch (error) {
    return handleRouteError(error, "GET register options", "The lender list could not be read.");
  }
}
