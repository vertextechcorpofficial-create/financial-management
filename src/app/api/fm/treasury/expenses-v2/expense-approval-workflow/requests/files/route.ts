import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AuthorityError } from "@/modules/financial-management/treasury/expenses-v2/expense-approval-workflow/domain/authorityErrors";
import { attachmentProof, latestRequests, requestEvents, requireWorkflowAccess, responseHeaders } from "../../_lib/independent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LIMIT = 10 * 1024 * 1024;
function failure(error: unknown) {
  return NextResponse.json({ error: error instanceof AuthorityError ? error.message : "Document transfer could not be confirmed. Please retry." }, { status: error instanceof AuthorityError ? error.status : 503, headers: responseHeaders });
}
async function boundedBody(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) throw new AuthorityError("EMPTY_FILE", "No file content supplied.", 400);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    size += result.value.length;
    if (size > limit) { await reader.cancel(); throw new AuthorityError("TOO_LARGE", "Document exceeds the 10 MB limit.", 413); }
    chunks.push(result.value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
export async function POST(request: NextRequest) {
  try {
    // Multipart counterpart of the JSON command origin guard.
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") throw new AuthorityError("INVALID_ORIGIN", "A same-origin upload is required.", 403);
    const actor = await requireWorkflowAccess(request);
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.startsWith("multipart/form-data;")) throw new AuthorityError("INVALID_CONTENT_TYPE", "Upload a multipart file.", 415);
    const content = await boundedBody(request.body, LIMIT + 64 * 1024);
    const form = await new Response(content, { headers: { "Content-Type": contentType } }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0 || file.size > LIMIT) throw new AuthorityError("INVALID_FILE", "Choose a nonempty file no larger than 10 MB.", 422);
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const prefix = Buffer.from(bytes);
    const detected = prefix.subarray(0, 5).toString() === "%PDF-" ? "application/pdf" : prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png" : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" : prefix.subarray(0, 4).toString() === "RIFF" && prefix.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
    if (!detected || file.type !== detected) throw new AuthorityError("INVALID_FILE", "Only matching PDF, JPEG, PNG or WebP file content is accepted.", 422);
    const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
    const token = process.env.DIRECTUS_STATIC_TOKEN;
    if (!base || !token) throw new AuthorityError("STORAGE_UNAVAILABLE", "Document storage is not configured.", 503);
    const upload = new FormData();
    upload.set("file", file);
    upload.set("title", `Expense workflow supporting document · requester ${actor.id}`);
    const response = await fetch(`${base}/files`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: upload, redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new AuthorityError("UPLOAD_FAILED", "Document upload failed. No expense request was submitted.", 503);
    const payload = await response.json();
    const id = payload.data?.id;
    if (!z.string().uuid().safeParse(id).success) throw new AuthorityError("UPLOAD_UNCONFIRMED", "Storage did not confirm a document reference.", 503);
    return NextResponse.json({ data: { id, name: file.name.slice(0, 255), size: file.size, type: detected, proof: attachmentProof(actor.id, id) } }, { status: 201, headers: responseHeaders });
  } catch (error) { return failure(error); }
}
export async function GET(request: NextRequest) {
  try {
    const actor = await requireWorkflowAccess(request);
    const id = request.nextUrl.searchParams.get("requestId");
    const index = Number(request.nextUrl.searchParams.get("index"));
    if (!z.string().uuid().safeParse(id).success || !Number.isSafeInteger(index) || index < 0 || request.nextUrl.searchParams.get("index") === null) throw new AuthorityError("INVALID_REFERENCE", "Invalid document request.", 400);
    const events = await requestEvents({ case_id: { _eq: id } });
    const current = latestRequests(events)[0];
    const requesterOwns = current?.requester_id === actor.id;
    const actorRecordedDecision = current && (current.actor_id === actor.id || current.snapshot.dummyLastOfficerId === actor.id) && ["APPROVE", "REJECT", "RETURN"].includes(current.action);
    if (!current || (!requesterOwns && !actorRecordedDecision)) throw new AuthorityError("NOT_FOUND", "Document not found in your scope.", 404);
    const revision = request.nextUrl.searchParams.get("revision");
    if (revision !== null && (!Number.isSafeInteger(Number(revision)) || Number(revision) <= 0)) throw new AuthorityError("INVALID_REFERENCE", "Invalid document revision.", 400);
    const source = revision === null ? current : events.find(event => event.revision === Number(revision));
    if (source && ["DRAFT", "NEEDS_CORRECTION"].includes(source.snapshot.status) && current.requester_id !== actor.id) throw new AuthorityError("NOT_FOUND", "Document not found in your scope.", 404);
    const file = source?.snapshot.attachments[index];
    if (!file || !z.string().uuid().safeParse(file.id).success) throw new AuthorityError("NOT_FOUND", "Document not found.", 404);
    const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "");
    const token = process.env.DIRECTUS_STATIC_TOKEN;
    if (!base || !token) throw new AuthorityError("STORAGE_UNAVAILABLE", "Document storage is not configured.", 503);
    const response = await fetch(`${base}/assets/${file.id}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new AuthorityError("DOCUMENT_UNAVAILABLE", "Document storage is unavailable.", 503);
    const bytes = await boundedBody(response.body, LIMIT);
    const type = ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type) ? file.type : "application/octet-stream";
    return new NextResponse(bytes, { headers: { ...responseHeaders, "Content-Type": type, "Content-Disposition": `inline; filename="workflow-document-${index + 1}"`, "Content-Security-Policy": "sandbox; default-src 'none'", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return failure(error); }
}
