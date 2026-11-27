import { currentUserId, handleRouteError, ok, toId } from "../../../_lib/http";
import { updateCompany } from "@/modules/financial-management/management-analytics/analytics-governance/services/governance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { name?: string; currency?: string };
    const result = await updateCompany(
      toId(id),
      { name: String(body.name ?? ""), currency: String(body.currency ?? "") },
      await currentUserId(),
    );
    return ok(result);
  } catch (error) {
    return handleRouteError(error, "updating company registry", "The company record could not be updated.");
  }
}
