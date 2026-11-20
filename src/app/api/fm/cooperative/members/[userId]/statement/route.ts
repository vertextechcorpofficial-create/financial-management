import { getMemberStatement } from "@/modules/financial-management/cooperative/server/member-service";
import { memberRouteId, missingMemberId, withMembers } from "../../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  return withMembers(async () => {
    const userId = memberRouteId((await params).userId);
    if (!userId) return missingMemberId();
    return Response.json(await getMemberStatement(userId, new URL(request.url).searchParams));
  });
}
