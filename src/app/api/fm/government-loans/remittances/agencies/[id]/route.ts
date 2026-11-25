import { updateAgency } from "@/modules/financial-management/government-loans/server/agencies";
import { withAgencyAccess } from "../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAgencyAccess(async actor => {
    const { id } = await params;
    return updateAgency(id, await request.json().catch(() => null), actor);
  });
}
