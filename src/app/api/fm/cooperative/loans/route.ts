import { getLoanRegister } from "@/modules/financial-management/cooperative/server/loans";
import { withLoans } from "./_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withLoans(() => getLoanRegister(new URL(request.url).searchParams));
}
