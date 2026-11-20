import { listCooperativeDocuments, uploadCooperativeDocuments } from "@/modules/financial-management/cooperative/server/documents";
import { memberDocumentScope } from "@/modules/financial-management/cooperative/server/member-service";
import { memberRouteId, missingMemberId } from "../../_response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const userId = memberRouteId((await params).userId);
  if (!userId) return missingMemberId();
  const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
  return listCooperativeDocuments(memberDocumentScope(userId), Number.isSafeInteger(page) ? page : 1);
}

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const userId = memberRouteId((await params).userId);
  if (!userId) return missingMemberId();
  return uploadCooperativeDocuments(memberDocumentScope(userId), request);
}
