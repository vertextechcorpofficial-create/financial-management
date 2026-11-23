import { getSettlementReversalPreview, reverseClearanceSettlement } from "@/modules/financial-management/cooperative/server/clearance-reversal";
import { ClearanceError } from "@/modules/financial-management/cooperative/server/clearance-store";
import { withClearance } from "../../../../exit-clearance/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  return withClearance(async actor => {
    const id = Number((await params).id);
    const body = await request.json().catch(() => null);
    if (body?.action === "preview") return getSettlementReversalPreview(id);
    if (body?.action === "post") return reverseClearanceSettlement(id, body, actor);
    throw new ClearanceError(400, "Choose to review or post a settlement reversal.");
  }, "transactions");
}
