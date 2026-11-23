import { removeCooperativeDocument, serveCooperativeDocument } from "@/modules/financial-management/cooperative/server/documents";
import { memberDocumentScope } from "@/modules/financial-management/cooperative/server/member-service";
import { memberRouteId, missingMemberId } from "../../../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ userId: string; documentId: string }> }) {
  const { userId: rawUserId, documentId } = await params;
  const userId = memberRouteId(rawUserId);
  if (!userId) return missingMemberId();
  const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
  return serveCooperativeDocument(memberDocumentScope(userId), documentId, disposition);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string; documentId: string }> }) {
  const { userId: rawUserId, documentId } = await params;
  const userId = memberRouteId(rawUserId);
  if (!userId) return missingMemberId();
  const body = await request.json().catch(() => null);
  const reason = body && typeof body.reason === "string" ? body.reason : undefined;
  return removeCooperativeDocument(memberDocumentScope(userId), documentId, request, reason);
}
