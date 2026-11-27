import { fail, handleRouteError, ok } from "../_lib/http";
import { loadRegister } from "@/modules/financial-management/management-analytics/analytics-variance/services/variance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const size = Number(url.searchParams.get("size") ?? "10");
  try {
    const board = await loadRegister({
      company: url.searchParams.get("company") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      page: Number.isFinite(page) ? page : 1,
      size: Number.isFinite(size) ? size : 10,
    });
    return ok(board);
  } catch (error) {
    // A filter value that does not exist is the caller's mistake, not a broken register.
    if (error instanceof Error && error.name === "BadRequestError") return fail(error.message, 400);
    if (error instanceof Error === false) return fail("The register could not be read.", 500);
    return handleRouteError(error, "GET /variance", "The register could not be read.");
  }
}
