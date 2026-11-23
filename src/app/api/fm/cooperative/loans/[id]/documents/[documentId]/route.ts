import { removeCooperativeDocument, serveCooperativeDocument } from "@/modules/financial-management/cooperative/server/documents";
import { loanDocumentScope } from "@/modules/financial-management/cooperative/server/loan-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; documentId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { id, documentId } = await params;
  const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
  return serveCooperativeDocument(loanDocumentScope(Number(id)), documentId, disposition);
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { id, documentId } = await params;
  const body = await request.json().catch(() => null);
  return removeCooperativeDocument(loanDocumentScope(Number(id)), documentId, request, typeof body?.reason === "string" ? body.reason : undefined);
}
