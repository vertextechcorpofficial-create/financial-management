import { ok, handleRouteError } from "../_lib/http";
import { loadCadence } from "@/modules/financial-management/management-analytics/analytics-cadence/services/cadence.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? undefined;
    return ok(await loadCadence(period));
  } catch (error) {
    return handleRouteError(error, "cadence", "The pack could not be read.");
  }
}
