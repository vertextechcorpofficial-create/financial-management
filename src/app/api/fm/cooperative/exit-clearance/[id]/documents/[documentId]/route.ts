import { clearanceDocumentScope } from "@/modules/financial-management/cooperative/server/clearance-documents";
import { removeCooperativeDocument, serveCooperativeDocument } from "@/modules/financial-management/cooperative/server/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; documentId: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id, documentId } = await params;
  const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
  return serveCooperativeDocument(clearanceDocumentScope(Number(id)), documentId, disposition);
}

export async function DELETE(request: Request, { params }: Context) {
  const { id, documentId } = await params;
  const body = await request.json().catch(() => null);
  return removeCooperativeDocument(clearanceDocumentScope(Number(id)), documentId, request,
    typeof body?.reason === "string" ? body.reason : undefined);
}
