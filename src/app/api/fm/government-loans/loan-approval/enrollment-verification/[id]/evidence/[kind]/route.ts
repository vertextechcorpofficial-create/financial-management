import { requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { downloadEnrollmentEvidence, parseEnrollmentEvidenceKind } from "@/modules/financial-management/government-loans/server/request-documents";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Route = { params: Promise<{ id: string; kind: string }> };

export function GET(_request: Request, { params }: Route) {
  return withLoanRequestAccess("loan-approval", async () => {
    const { id, kind } = await params;
    return downloadEnrollmentEvidence(requestId(id), parseEnrollmentEvidenceKind(kind));
  });
}
