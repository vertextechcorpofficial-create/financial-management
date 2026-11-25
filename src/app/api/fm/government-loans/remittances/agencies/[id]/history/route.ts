import { listAgencyHistory } from "@/modules/financial-management/government-loans/server/agencies";
import { withAgencyAccess } from "../../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAgencyAccess(async () => {
    const { id } = await params;
    return listAgencyHistory(id, new URL(request.url).searchParams);
  });
}
