import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { maxFileSize, maxFiles } from "../document-limits";
import type { CooperativeWorkspaceKey } from "../workspaces";
import { requireCooperativeWorkspace } from "./access";
import { cooperativeAuditEvent, cooperativeAuditTime } from "./audit";
import { cooperativeDirectus, CooperativeDirectusError, readDirectusItems } from "./directus";
import { CooperativeDocumentError, documentDigest, readCooperativeUpload } from "./document-input";
import { privateCooperativeFolder, readCooperativeAsset, uploadCooperativeAsset } from "./document-storage";
import { discardDocumentParts, readStagedDocumentUpload, stageDocumentPart } from "./document-upload-parts";

type Operation = "read" | "upload" | "remove";
type Owner = { type: "MEMBER" | "LOAN" | "CLEARANCE"; id: number; revision?: number };
type MetadataWrite = { create: Record<string, unknown>[] } | { update: Record<string, unknown>[] };
type Scope = {
  workspace: CooperativeWorkspaceKey;
  // Provided by the owning submodule. Check that the verified actor can perform
  // this operation on the current record, including member ownership and status.
  loadOwner: (actorId: number, operation: Operation) => Promise<Owner | null>;
  writeMetadata?: (owner: Owner, actor: Actor, change: MetadataWrite) => Promise<void>;
};

const collection = "cooperative_documents";
const items = `/items/${collection}`;
const pageSize = 50;
const documentId = z.string().regex(/^[0-9a-f]{64}$/);
const documentFields = z.object({
  id: documentId,
  document_type_id: z.number().int().positive(),
  file_id: z.uuid(),
  file_name: z.string(),
  mime_type: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  size_bytes: z.number().int().positive().max(maxFileSize),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  uploaded_by: z.number().int().positive(),
  uploaded_at: z.string(),
  removed_at: z.string().nullable(),
  request_hash: z.string(),
  batch_index: z.number().int().nonnegative(),
});
type DocumentRow = z.output<typeof documentFields>;
type Actor = Extract<Awaited<ReturnType<typeof requireCooperativeWorkspace>>, { ok: true }>;

function metadata(row: DocumentRow) {
  return {
    id: row.id, documentTypeId: row.document_type_id, filename: row.file_name,
    mimeType: row.mime_type, size: row.size_bytes, uploadedBy: row.uploaded_by,
    uploadedAt: `${row.uploaded_at}Z`, removedAt: row.removed_at ? `${row.removed_at}Z` : null,
  };
}

function ownerFilter(owner: Owner) {
  return { owner_type: { _eq: owner.type }, owner_id: { _eq: owner.id } };
}

async function readDocuments(filter: object, limit: number, sort = "-uploaded_at,-id", offset = 0) {
  const query = new URLSearchParams({
    fields: Object.keys(documentFields.shape).join(","),
    filter: JSON.stringify(filter), sort, limit: String(limit), offset: String(offset),
  });
  return z.object({ data: z.array(documentFields) }).parse(await readDirectusItems(collection, query)).data;
}

async function findDocument(owner: Owner, id: string) {
  if (!documentId.safeParse(id).success) return undefined;
  return (await readDocuments({ ...ownerFilter(owner), id: { _eq: id } }, 1))[0];
}

async function withOwner(scope: Scope, operation: Operation, run: (owner: Owner, actor: Actor) => Promise<Response>) {
  const access = await requireCooperativeWorkspace(scope.workspace);
  let response: Response;
  if (!access.ok) {
    response = Response.json({ message: access.message }, { status: access.status });
  } else {
    try {
      const owner = await scope.loadOwner(access.actorId, operation);
      if (!owner) throw new CooperativeDocumentError(404, "The owning record is unavailable.");
      response = await run(owner, access);
    } catch (error) {
      const known = error instanceof CooperativeDocumentError;
      response = Response.json({
        message: known ? error.message : "Cooperative documents are temporarily unavailable. Please try again.",
      }, { status: known ? error.status : 503 });
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  for (const cookie of access.setCookies) response.headers.append("Set-Cookie", cookie);
  return response;
}

async function readDocumentTypesOnFile(filter: object) {
  const query = new URLSearchParams({
    filter: JSON.stringify(filter), "groupBy[]": "document_type_id", "aggregate[count]": "*", limit: "-1",
  });
  const typeId = z.coerce.number().int().positive();
  const groups = z.object({ data: z.array(z.object({ document_type_id: typeId })) }).parse(await readDirectusItems(collection, query)).data;
  if (!groups.length) return [];
  const ids = groups.map(group => group.document_type_id);
  const typeQuery = new URLSearchParams({ fields: "id,name", limit: "-1", "filter[id][_in]": ids.join(",") });
  const types = z.object({ data: z.array(z.object({ id: typeId, name: z.string() })) }).parse(
    await readDirectusItems("cooperative_document_types", typeQuery),
  ).data;
  const names = new Map(types.map(type => [type.id, type.name]));
  return ids.map(id => ({ id, name: names.get(id) ?? `Document type ${id}` })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listCooperativeDocuments(scope: Scope, page = 1, documentTypeId?: number) {
  return withOwner(scope, "read", async owner => {
    const offset = (page - 1) * pageSize;
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(offset)) {
      throw new CooperativeDocumentError(400, "Choose a valid page.");
    }
    if (documentTypeId !== undefined && (!Number.isSafeInteger(documentTypeId) || documentTypeId < 1)) {
      throw new CooperativeDocumentError(400, "Choose a valid document type.");
    }
    const all = { ...ownerFilter(owner), removed_at: { _null: true } };
    const filtered = documentTypeId ? { ...all, document_type_id: { _eq: documentTypeId } } : all;
    const [rows, documentTypes] = await Promise.all([
      readDocuments(filtered, pageSize + 1, "-uploaded_at,-id", offset), readDocumentTypesOnFile(all),
    ]);
    const names = new Map(documentTypes.map(type => [type.id, type.name]));
    const listed = rows.slice(0, pageSize).map(row => ({
      ...metadata(row), documentTypeName: names.get(row.document_type_id) ?? `Document type ${row.document_type_id}`,
    }));
    return Response.json({ items: listed, hasMore: rows.length > pageSize, documentTypes });
  });
}

function documentAudit(actor: Actor, request: Request, row: DocumentRow, now: Date, removed?: { at: string; reason?: string }) {
  const action = removed ? "DOCUMENT_REMOVED" : "DOCUMENT_UPLOADED";
  const details = { filename: row.file_name, documentTypeId: row.document_type_id, size: row.size_bytes };
  const event = cooperativeAuditEvent(actor, {
    subject: { type: "DOCUMENT", id: row.id },
    action,
    userAgent: request.headers.get("User-Agent"),
    ...(removed
      ? { before: { removedAt: null }, after: { removedAt: `${removed.at}Z` }, reason: removed.reason }
      : { after: details }),
  }, now);
  return { ...event, document_event_key: `${row.id}:${action}` };
}

async function writeDocuments(method: "POST" | "PATCH", path: string, body: object) {
  await (await cooperativeDirectus(path, {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }, 30_000)).body?.cancel();
}

async function cleanUnlinkedFiles(uploaded: string[]) {
  if (!uploaded.length) return;
  try {
    // The files belong to this attempt. Check even soft-removed links, then
    // let the file foreign key protect against any intervening reference.
    const query = new URLSearchParams({
      fields: "file_id", limit: String(uploaded.length), "filter[file_id][_in]": uploaded.join(","),
    });
    const linked = z.object({ data: z.array(z.object({ file_id: z.uuid() })) }).parse(await readDirectusItems(collection, query));
    const unused = uploaded.filter(id => !linked.data.some(row => row.file_id === id));
    const outcomes = await Promise.allSettled(unused.map(id => cooperativeDirectus(`/files/${id}`, { method: "DELETE" })));
    if (outcomes.some(outcome => outcome.status === "rejected")) console.error("Cooperative staged file cleanup was incomplete.");
  } catch {
    console.error("Could not verify Cooperative staged file references.");
  }
}

function knownRollback(error: unknown) {
  return (error instanceof CooperativeDirectusError || error instanceof CooperativeDocumentError) &&
    [400, 401, 403, 404, 409, 413, 415, 422].includes(error.status);
}

export async function stageCooperativeDocumentPart(scope: Scope, request: Request) {
  return withOwner(scope, "upload", async (owner, actor) => {
    await stageDocumentPart(request, await privateCooperativeFolder(), owner.type + ":" + owner.id, actor.actorId);
    return new Response(null, { status: 204 });
  });
}

export async function discardCooperativeDocumentParts(scope: Scope, request: Request) {
  return withOwner(scope, "upload", async (owner, actor) => {
    await discardDocumentParts(request, owner.type + ":" + owner.id, actor.actorId);
    return new Response(null, { status: 204 });
  });
}

export async function uploadCooperativeDocuments(scope: Scope, request: Request) {
  return withOwner(scope, "upload", async (owner, actor) => {
    const folder = await privateCooperativeFolder();
    const upload = request.headers.get("Content-Type") === "application/json"
      ? await readStagedDocumentUpload(request, owner.type + ":" + owner.id, actor.actorId)
      : await readCooperativeUpload(request);
    const batchKey = documentDigest(JSON.stringify([owner.type, owner.id, actor.actorId, upload.key]));
    const digest = documentDigest(JSON.stringify([
      upload.documentTypeId, upload.files.map(file => [file.name, file.mime, file.digest]),
    ]));
    const readBatch = () => readDocuments({ ...ownerFilter(owner), batch_key: { _eq: batchKey } }, maxFiles + 1, "batch_index");
    function replay(rows: DocumentRow[], status = 200) {
      if (rows.length !== upload.files.length || rows.some(row => row.request_hash !== digest)) {
        throw new CooperativeDocumentError(409, "This upload key already belongs to a different batch.");
      }
      return Response.json({ items: rows.map(metadata) }, { status });
    }

    const previous = await readBatch();
    if (previous.length) return replay(previous);
    const typeQuery = new URLSearchParams({ fields: "id", "filter[id][_eq]": String(upload.documentTypeId), limit: "1" });
    const types = z.object({ data: z.array(z.object({ id: z.number() })) }).parse(
      await readDirectusItems("cooperative_document_types", typeQuery),
    );
    if (!types.data.length) throw new CooperativeDocumentError(422, "Choose an existing document type.");

    const uploaded: string[] = [];
    let metadataSent = false;
    try {
      const rows = [];
      for (const [index, file] of upload.files.entries()) {
        const id = randomUUID();
        await uploadCooperativeAsset(id, folder, file.file, file.mime, file.extension);
        uploaded.push(id);
        const now = new Date();
        const row = {
          id: documentDigest(JSON.stringify([batchKey, index])), document_type_id: upload.documentTypeId,
          file_id: id, file_name: file.name, mime_type: file.mime, size_bytes: file.file.size, sha256: file.digest,
          uploaded_by: actor.actorId, uploaded_at: cooperativeAuditTime(now), removed_at: null,
          batch_index: index, request_hash: digest,
        };
        rows.push({
          ...row, owner_type: owner.type, owner_id: owner.id, batch_key: batchKey,
          upload_event_id: documentAudit(actor, request, row, now),
        });
      }
      const current = await requireCooperativeWorkspace(scope.workspace);
      const currentOwner = current.ok && current.actorId === actor.actorId && await scope.loadOwner(actor.actorId, "upload");
      if (!currentOwner || currentOwner.id !== owner.id || currentOwner.type !== owner.type) {
        throw new CooperativeDocumentError(403, "Your access to this record changed during the upload.");
      }
      metadataSent = true;
      if (scope.writeMetadata) await scope.writeMetadata(currentOwner, actor, { create: rows });
      else await writeDocuments("POST", items, rows);
      return replay(await readBatch(), 201);
    } catch (error) {
      const saved = metadataSent ? await readBatch().catch(() => undefined) : undefined;
      if (!metadataSent || knownRollback(error) || saved?.length) await cleanUnlinkedFiles(uploaded);
      if (saved?.length) return replay(saved);
      // An interrupted database request might still commit. Keep its files and
      // let a retry resolve the batch by key before attempting another write.
      throw error;
    }
  });
}

export async function serveCooperativeDocument(scope: Scope, id: string, disposition: "inline" | "attachment") {
  return withOwner(scope, "read", async owner => {
    const row = await findDocument(owner, id);
    if (!row || row.removed_at) throw new CooperativeDocumentError(404, "The document is unavailable.");
    await privateCooperativeFolder();
    const bytes = await readCooperativeAsset(row.file_id, row.size_bytes);
    if (documentDigest(bytes) !== row.sha256) throw new Error("Unexpected document contents.");
    const filename = encodeURIComponent(row.file_name).replace(/['()*]/g, character =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(bytes, { headers: {
      "Content-Type": row.mime_type,
      "Content-Disposition": `${disposition}; filename*=UTF-8''${filename}`,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    } });
  });
}

export async function removeCooperativeDocument(scope: Scope, id: string, request: Request, reason?: string) {
  return withOwner(scope, "remove", async (owner, actor) => {
    if (reason && reason.trim().length > 500) {
      throw new CooperativeDocumentError(400, "Keep the removal reason to 500 characters.");
    }
    const row = await findDocument(owner, id);
    if (!row) throw new CooperativeDocumentError(404, "The document is unavailable.");
    if (row.removed_at) return new Response(null, { status: 204 });
    const now = new Date();
    const at = cooperativeAuditTime(now);
    try {
      const changes = {
        removed_at: at, removed_by: actor.actorId, removal_reason: reason?.trim() || null,
        removal_event_id: documentAudit(actor, request, row, now, { at, reason }),
      };
      if (scope.writeMetadata) await scope.writeMetadata(owner, actor, { update: [{ id: row.id, ...changes }] });
      else await writeDocuments("PATCH", `${items}/${row.id}`, changes);
    } catch (error) {
      const saved = await findDocument(owner, id).catch(() => undefined);
      if (!saved?.removed_at) throw error;
    }
    return new Response(null, { status: 204 });
  });
}
