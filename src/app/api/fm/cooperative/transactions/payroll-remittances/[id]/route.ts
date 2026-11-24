import { getRemittanceDetail, postRemittanceFile } from "@/modules/financial-management/cooperative/server/payroll-remittances";
import { getRemittanceReversalPreview, reverseRemittance } from "@/modules/financial-management/cooperative/server/payroll-remittance-reversal";
import { LoanError } from "@/modules/financial-management/cooperative/server/loans";
import { withLoans } from "../../../loans/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  return withLoans(async () => getRemittanceDetail(Number((await params).id), new URL(request.url).searchParams.has("review")), "transactions");
}

export async function POST(request: Request, { params }: Context) {
  return withLoans(async actor => {
    const id = Number((await params).id);
    const body = await request.json().catch(() => null);
    if (body?.action === "post") return postRemittanceFile(id, body, actor);
    if (body?.action === "review-reversal") return getRemittanceReversalPreview(id);
    if (body?.action === "reverse") return reverseRemittance(id, body, actor);
    throw new LoanError(400, "Choose a remittance action.");
  }, "transactions");
}
