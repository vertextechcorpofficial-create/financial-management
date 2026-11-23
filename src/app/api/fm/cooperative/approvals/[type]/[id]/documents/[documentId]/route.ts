import { serveCooperativeDocument } from "@/modules/financial-management/cooperative/server/documents";
import { loanDocumentScope } from "@/modules/financial-management/cooperative/server/loan-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ type: string; id: string; documentId: string }> }) {
  const { type, id, documentId } = await params;
  const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
  return serveCooperativeDocument(loanDocumentScope(type === "loan" ? Number(id) : 0, "approvals"), documentId, disposition);
}
