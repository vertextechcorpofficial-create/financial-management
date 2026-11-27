import { documentKind, requestId } from "@/modules/financial-management/government-loans/server/loan-requests";
import { downloadRequestDocument, saveRequestDocument } from "@/modules/financial-management/government-loans/server/request-documents";
import { LoanRequestError } from "@/modules/financial-management/government-loans/server/request-input";
import { withLoanRequestAccess } from "@/modules/financial-management/government-loans/server/request-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Route = { params: Promise<{ id: string; kind: string }> };

async function documentParams(params: Route["params"]) {
  const { id, kind } = await params;
  const parsed = documentKind.safeParse(kind);
  if (!parsed.success) throw new LoanRequestError(404, "This request document could not be found.");
  return { id: requestId(id), kind: parsed.data };
}

export function GET(_request: Request, { params }: Route) {
  return withLoanRequestAccess("my-loans", async actor => {
    const { id, kind } = await documentParams(params);
    return downloadRequestDocument(id, kind, false, actor.actorId);
  });
}

export function POST(request: Request, { params }: Route) {
  return withLoanRequestAccess("my-loans", async actor => {
    const { id, kind } = await documentParams(params);
    return saveRequestDocument(id, kind, request, actor, actor.actorId);
  });
}
