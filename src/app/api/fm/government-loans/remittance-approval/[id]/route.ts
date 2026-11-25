import { z } from "zod";
import { decideRemittanceApproval, downloadApprovalProof, reviewRemittanceApproval } from "@/modules/financial-management/government-loans/server/remittance-approval";
import { listRemittanceDeductions } from "@/modules/financial-management/government-loans/server/remittance-preparation";
import { LoanRequestError } from "@/modules/financial-management/government-loans/server/request-input";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function remittanceId(context: Context) {
  const result = z.uuid().safeParse((await context.params).id);
  if (!result.success) throw new LoanRequestError(404, "Remittance could not be found.");
  return result.data;
}

export function GET(request: Request, context: Context) {
  return withLoanRequestAccess("remittance-approval", async () => {
    const id = await remittanceId(context);
    const query = new URL(request.url).searchParams;
    if (query.get("proof") === "1") return downloadApprovalProof(id, query.get("inline") === "1");
    if (query.get("deductions") === "1") return listRemittanceDeductions(query, id);
    return reviewRemittanceApproval(id);
  });
}

export function POST(request: Request, context: Context) {
  return withLoanRequestAccess("remittance-approval", async actor => {
    const id = await remittanceId(context);
    const input = await request.json().catch(() => { throw new LoanRequestError(400, "Send the remittance decision as JSON."); });
    return decideRemittanceApproval(id, input, request.headers.get("Idempotency-Key"), actor);
  });
}
