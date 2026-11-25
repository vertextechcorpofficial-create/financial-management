import { previewExistingLoan } from "@/modules/financial-management/government-loans/server/loan-enrollment";
import { withRequestAccess } from "../../requests/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withRequestAccess(async () => previewExistingLoan(await request.json().catch(() => null)));
}
