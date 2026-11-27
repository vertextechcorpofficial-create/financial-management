import { currentUserId, handleRouteError, ok } from "../../_lib/http";
import { savePolicy } from "@/modules/financial-management/management-analytics/analytics-governance/services/governance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  key?: string;
  value?: string;
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const result = await savePolicy(String(body.key ?? ""), String(body.value ?? ""), await currentUserId());
    return ok(result);
  } catch (error) {
    return handleRouteError(error, "saving a policy value", "The policy could not be saved.");
  }
}
