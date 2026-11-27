import { getApprovalDetail } from "@/modules/financial-management/cooperative/server/approvals";
import { withApprovals } from "../../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  return withApprovals(() => getApprovalDetail(type, Number(id)));
}
