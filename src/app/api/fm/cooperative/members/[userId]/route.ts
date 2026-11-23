import { getMemberDetail } from "@/modules/financial-management/cooperative/server/member-service";
import { memberRouteId, missingMemberId, withMembers } from "../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const userId = memberRouteId((await params).userId);
  if (!userId) return missingMemberId();
  return withMembers(async () => Response.json(await getMemberDetail(userId)));
}
