import { decideClearance, editClearance } from "@/modules/financial-management/cooperative/server/clearance-commands";
import { getClearanceDetail } from "@/modules/financial-management/cooperative/server/clearance-store";
import { settleClearance } from "@/modules/financial-management/cooperative/server/clearance-posting";
import { withClearance } from "../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return withClearance(async () => getClearanceDetail(Number((await params).id)));
}

export async function PATCH(request: Request, { params }: Context) {
  return withClearance(async actor => editClearance(Number((await params).id), await request.json().catch(() => null), actor));
}

export async function POST(request: Request, { params }: Context) {
  return withClearance(async actor => {
    const id = Number((await params).id);
    const body = await request.json().catch(() => null);
    return body?.action === "settle" ? settleClearance(id, body, actor) : decideClearance(id, body, actor);
  });
}
