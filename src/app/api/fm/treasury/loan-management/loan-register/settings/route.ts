import { loadSettings } from "@/modules/financial-management/treasury/loan-management/loan-register/settings/services/settings.service";

import { handleRouteError, ok } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everything the settings page renders, in one read. */
export async function GET() {
  try {
    return ok(await loadSettings());
  } catch (error) {
    return handleRouteError(error, "GET loan settings", "The loan settings could not be read.");
  }
}
