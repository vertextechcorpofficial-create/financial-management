import { handleRouteError, ok } from "../_lib/http";
import { loadGovernance } from "@/modules/financial-management/management-analytics/analytics-governance/services/governance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return ok(await loadGovernance());
  } catch (error) {
    return handleRouteError(error, "loading access and governance", "The access data could not be read.");
  }
}
