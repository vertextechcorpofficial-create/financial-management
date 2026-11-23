import {
  discardCooperativeDocumentParts, listCooperativeDocuments, stageCooperativeDocumentPart, uploadCooperativeDocuments,
} from "@/modules/financial-management/cooperative/server/documents";
import { loanDocumentScope } from "@/modules/financial-management/cooperative/server/loan-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const search = new URL(request.url).searchParams;
  const type = search.get("documentTypeId");
  return listCooperativeDocuments(loanDocumentScope(Number((await params).id)), Number(search.get("page") ?? 1), type === null ? undefined : Number(type));
}

export async function POST(request: Request, { params }: RouteContext) {
  return uploadCooperativeDocuments(loanDocumentScope(Number((await params).id)), request);
}

export async function PUT(request: Request, { params }: RouteContext) {
  return stageCooperativeDocumentPart(loanDocumentScope(Number((await params).id)), request);
}

export async function DELETE(request: Request, { params }: RouteContext) {
  return discardCooperativeDocumentParts(loanDocumentScope(Number((await params).id)), request);
}
