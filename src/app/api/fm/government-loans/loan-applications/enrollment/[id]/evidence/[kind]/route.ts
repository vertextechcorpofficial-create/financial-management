import { requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { downloadEnrollmentEvidence, parseEnrollmentEvidenceKind, saveEnrollmentEvidence } from "@/modules/financial-management/government-loans/server/request-documents";
import { withRequestAccess } from "../../../../requests/_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Route = { params: Promise<{ id: string; kind: string }> };

export function GET(_request: Request, { params }: Route) {
  return withRequestAccess(async () => {
    const { id, kind } = await params;
    return downloadEnrollmentEvidence(requestId(id), parseEnrollmentEvidenceKind(kind));
  });
}

export function POST(request: Request, { params }: Route) {
  return withRequestAccess(async actor => {
    const { id, kind } = await params;
    return saveEnrollmentEvidence(requestId(id), parseEnrollmentEvidenceKind(kind), request, actor);
  });
}
