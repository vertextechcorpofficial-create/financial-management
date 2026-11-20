import { getApprovalQueue } from "@/modules/financial-management/cooperative/server/approvals";
import { withApprovals } from "./_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withApprovals(() => getApprovalQueue(new URL(request.url).searchParams));
}
