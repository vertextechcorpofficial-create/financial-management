import { clearanceDocumentScope } from "@/modules/financial-management/cooperative/server/clearance-documents";
import {
  discardCooperativeDocumentParts, listCooperativeDocuments, stageCooperativeDocumentPart, uploadCooperativeDocuments,
} from "@/modules/financial-management/cooperative/server/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const query = new URL(request.url).searchParams;
  const type = query.get("documentTypeId");
  return listCooperativeDocuments(clearanceDocumentScope(Number((await params).id)),
    Number(query.get("page") ?? 1), type === null ? undefined : Number(type));
}

export async function POST(request: Request, { params }: Context) {
  return uploadCooperativeDocuments(clearanceDocumentScope(Number((await params).id)), request);
}

export async function PUT(request: Request, { params }: Context) {
  return stageCooperativeDocumentPart(clearanceDocumentScope(Number((await params).id)), request);
}

export async function DELETE(request: Request, { params }: Context) {
  return discardCooperativeDocumentParts(clearanceDocumentScope(Number((await params).id)), request);
}
