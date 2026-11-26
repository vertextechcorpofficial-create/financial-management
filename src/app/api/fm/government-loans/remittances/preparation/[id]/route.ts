import { z } from "zod";
import { listRemittanceDeductions, readPreparedRemittance } from "@/modules/financial-management/government-loans/server/remittance-preparation";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";
import { LoanRequestError } from "@/modules/financial-management/government-loans/server/request-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLoanRequestAccess("remittances", async () => {
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new LoanRequestError(404, "Remittance could not be found.");
    const query = new URL(request.url).searchParams;
    return query.get("deductions") === "1" ? listRemittanceDeductions(query, id.data)
      : readPreparedRemittance(id.data, query.get("proof") === "1");
  });
}
