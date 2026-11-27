import { getLoanDetail, LoanError } from "@/modules/financial-management/cooperative/server/loans";
import { loanDocumentOptions } from "@/modules/financial-management/cooperative/server/loan-documents";
import { withLoans } from "../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  return withLoans(async () => {
    const detail = await getLoanDetail(id);
    if (!detail) throw new LoanError(404, "The loan is unavailable.");
    return { ...detail, documentOptions: await loanDocumentOptions() };
  });
}
