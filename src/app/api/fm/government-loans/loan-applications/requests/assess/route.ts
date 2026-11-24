import { assessRequest } from "@/modules/financial-management/government-loans/server/request-assessment";
import { addRequestInput, parseInput } from "@/modules/financial-management/government-loans/server/request-input";
import { withRequestAccess } from "../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withRequestAccess(async () => assessRequest(parseInput(addRequestInput, await request.json().catch(() => null)).form));
}
