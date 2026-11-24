import { previewLoanImport } from "@/modules/financial-management/government-loans/server/loan-imports";
import { withRequestAccess } from "../../../requests/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withRequestAccess(() => previewLoanImport(request));
}
