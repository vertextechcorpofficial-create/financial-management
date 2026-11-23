import { getClearanceMemberChoices } from "@/modules/financial-management/cooperative/server/clearance-store";
import { withClearance } from "../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withClearance(() => getClearanceMemberChoices(new URL(request.url).searchParams));
}
