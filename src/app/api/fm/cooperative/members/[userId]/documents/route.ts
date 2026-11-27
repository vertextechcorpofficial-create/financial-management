import {
  discardCooperativeDocumentParts, listCooperativeDocuments, stageCooperativeDocumentPart, uploadCooperativeDocuments,
} from "@/modules/financial-management/cooperative/server/documents";
import { memberDocumentScope } from "@/modules/financial-management/cooperative/server/member-service";
import { memberRouteId, missingMemberId } from "../../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const userId = memberRouteId((await params).userId);
  if (!userId) return missingMemberId();
  const search = new URL(request.url).searchParams;
  const page = Number(search.get("page") ?? "1");
  const type = search.get("documentTypeId");
  return listCooperativeDocuments(memberDocumentScope(userId), page, type === null ? undefined : memberRouteId(type) ?? 0);
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const userId = memberRouteId((await params).userId);
  if (!userId) return missingMemberId();
  return uploadCooperativeDocuments(memberDocumentScope(userId), request);
}

export async function PUT(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const userId = memberRouteId((await params).userId);
  if (!userId) return missingMemberId();
  return stageCooperativeDocumentPart(memberDocumentScope(userId), request);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const userId = memberRouteId((await params).userId);
  if (!userId) return missingMemberId();
  return discardCooperativeDocumentParts(memberDocumentScope(userId), request);
}
