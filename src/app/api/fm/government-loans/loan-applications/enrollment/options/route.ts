import { listPriorLoans } from "@/modules/financial-management/government-loans/server/loan-enrollment";
import { withRequestAccess } from "../../requests/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withRequestAccess(() => listPriorLoans(new URL(request.url).searchParams));
}
