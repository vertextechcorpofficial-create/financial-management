import { getPolicyHistory } from "@/modules/financial-management/cooperative/server/policies";
import { withPolicies } from "../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withPolicies(() => getPolicyHistory(new URL(request.url).searchParams));
}
