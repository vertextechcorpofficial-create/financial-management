import { getMemberLoanDetail } from "@/modules/financial-management/cooperative/server/member-service";
import { memberRouteId, withMembers } from "../../../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string; loanId: string }> }) {
  return withMembers(async () => {
    const route = await params;
    const userId = memberRouteId(route.userId);
    const loanId = memberRouteId(route.loanId);
    if (userId === null || loanId === null) return Response.json({ message: "The member's loan is unavailable." }, { status: 404 });
    return Response.json(await getMemberLoanDetail(userId, loanId));
  });
}
