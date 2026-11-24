import { saveCloseEvidence } from "@/modules/financial-management/cooperative/server/reconciliation-evidence";
import { withMembers } from "../../members/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withMembers(async actor => Response.json(await saveCloseEvidence(actor, await request.json().catch(() => null))), "reports");
}
