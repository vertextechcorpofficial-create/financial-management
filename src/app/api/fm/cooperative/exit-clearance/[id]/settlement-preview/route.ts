import { getSettlementPreview } from "@/modules/financial-management/cooperative/server/clearance-settlement";
import { withClearance } from "../../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return withClearance(async () => getSettlementPreview(Number((await params).id)));
}
