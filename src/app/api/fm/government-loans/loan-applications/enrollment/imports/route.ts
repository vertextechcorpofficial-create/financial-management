import { commitLoanImport, listLoanImports } from "@/modules/financial-management/government-loans/server/loan-imports";
import { withRequestAccess } from "../../requests/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withRequestAccess(() => listLoanImports(new URL(request.url).searchParams));
}

export async function POST(request: Request) {
  return withRequestAccess(actor => commitLoanImport(request, actor), 201);
}
