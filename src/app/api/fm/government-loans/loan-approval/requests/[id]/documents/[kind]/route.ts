import { documentKind, requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { downloadRequestDocument } from "@/modules/financial-management/government-loans/server/request-documents";
import { LoanRequestError } from "@/modules/financial-management/government-loans/server/request-input";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(_request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  return withLoanRequestAccess("loan-approval", async () => {
    const { id, kind } = await params;
    const parsed = documentKind.safeParse(kind);
    if (!parsed.success) throw new LoanRequestError(404, "This request document could not be found.");
    return downloadRequestDocument(requestId(id), parsed.data, true);
  });
}
