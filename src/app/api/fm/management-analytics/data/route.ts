import { handleRouteError, ok } from "../_lib/http";
import { loadData } from "@/modules/financial-management/management-analytics/analytics-data/services/data.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return ok(await loadData(url.searchParams.get("period") ?? undefined));
  } catch (error) {
    return handleRouteError(error, "data", "The data desk could not be read.");
  }
}
