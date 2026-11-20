import { currentUserId, handleRouteError, ok } from "../../_lib/http";
import { createAssignment } from "@/modules/financial-management/management-analytics/analytics-governance/services/governance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  userId?: number;
  roleId?: number;
  companyId?: number;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const result = await createAssignment(
      { userId: Number(body.userId ?? 0), roleId: Number(body.roleId ?? 0), companyId: Number(body.companyId ?? 0) },
      await currentUserId(),
    );
    return ok(result, 201);
  } catch (error) {
    return handleRouteError(error, "granting access", "The access grant could not be saved.");
  }
}
