import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CooperativeDocumentError, readCooperativeUpload,
} from "@/modules/financial-management/cooperative/server/document-input";
import { readCooperativeAsset, uploadCooperativeAsset } from "@/modules/financial-management/cooperative/server/document-storage";
import { excludesRequestFolder, requestDocumentFolder } from "../requests/document-privacy";
import type { DocumentKind, EnrollmentEvidenceKind, LoanDocumentKind } from "../requests/types";
import type { AgencyActor } from "./agencies";
import {
  GOVERNMENT_LOAN_REQUEST_DOCUMENTS, GovernmentLoansDirectusError, governmentLoansDirectus, readGovernmentLoansItems,
} from "./directus";
import {
  assertDraft, assertFiledRequest, commitRequestRevision, enrollmentEvidenceKind, getLoanRequest, loanCommand,
  readCommandReceipt, readRequest, readRequestDocuments, type StoredLoanDocument,
} from "./loan-requests";
import { readStagedEnrollment } from "./loan-enrollment";
import { LoanRequestError, positiveId } from "./request-input";

export async function privateRequestFolder() {
  const filters = new URLSearchParams({
    fields: "id", limit: "2", "filter[name][_eq]": requestDocumentFolder, "filter[parent][_null]": "true",
  });
  const [folders, permissions] = await Promise.all([
    governmentLoansDirectus("/folders?" + filters).then(response => response.json()),
    governmentLoansDirectus("/permissions?fields=collection,permissions&limit=-1&filter[collection][_in]=directus_files,*&filter[action][_in]=read,update,delete,share")
      .then(response => response.json()),
  ]);
  const { data } = z.object({ data: z.array(z.object({ id: z.uuid() })).length(1) }).parse(folders);
  const { data: rows } = z.object({ data: z.array(z.object({ collection: z.string(), permissions: z.unknown() })) }).parse(permissions);
  const folder = data[0].id.toLowerCase();
  if (rows.some(row => row.collection === "*" || !excludesRequestFolder(row.permissions, folder))) {
    throw new LoanRequestError(503, "Private request document storage is unavailable.");
  }
  return folder;
}

async function removeUnlinkedFile(fileId: string) {
  const filter = new URLSearchParams({ fields: "id", limit: "1", "filter[file_id][_eq]": fileId });
  const { data } = z.object({ data: z.array(z.object({ id: positiveId })).max(1) })
    .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUEST_DOCUMENTS, filter));
  if (!data.length) await governmentLoansDirectus("/files/" + fileId, { method: "DELETE" });
}

async function saveLoanDocument(id: number, kind: LoanDocumentKind, request: Request, actor: AgencyActor, enrollment: boolean) {
  const revision = positiveId.safeParse(request.headers.get("If-Match"));
  if (!revision.success) throw new LoanRequestError(422, "Reload the record before attaching a document.");
  if (Number(request.headers.get("Content-Length")) > 6 * 1024 * 1024) throw new LoanRequestError(413, "Choose a file of 5 MB or less.");
  const upload = await readCooperativeUpload(request).catch(error => {
    if (error instanceof CooperativeDocumentError) throw new LoanRequestError(error.status, error.message);
    throw error;
  });
  const [asset] = upload.files;
  if (upload.files.length !== 1) throw new LoanRequestError(422, "Choose one file for this document.");
  if (asset.file.size > 5 * 1024 * 1024) throw new LoanRequestError(413, "Choose a file of 5 MB or less.");

  const command = loanCommand(upload.key, {
    action: enrollment ? "attach-enrollment-evidence" : "attach", kind, revision: revision.data, sha256: asset.digest, name: asset.name,
  }, actor, id);
  const replay = await readCommandReceipt(command);
  if (replay) return replay;
  const row = await (enrollment ? readStagedEnrollment(id) : readRequest(id));
  if (enrollment) {
    if ((row.status !== "ENROLLED" && row.status !== "RETURNED") || row.revision !== revision.data) {
      throw new LoanRequestError(409, "Reload the enrollment before updating its evidence. Verified evidence is locked.");
    }
  } else {
    assertDraft(row, revision.data);
  }
  const current = (await readRequestDocuments(id)).find(document => document.kind === kind);
  const folder = await privateRequestFolder();
  const fileId = randomUUID();
  await uploadCooperativeAsset(fileId, folder, asset.file, asset.mime, asset.extension, "Government Loan Request " + id);

  const now = new Date().toISOString();
  const data = {
    kind, file_id: fileId, file_name: asset.name, mime_type: asset.mime,
    size_bytes: asset.file.size, sha256: asset.digest, uploaded_at: now, uploaded_by: actor.actorId,
  };
  try {
    const action = enrollment ? "ENROLLMENT_EVIDENCE_UPDATED" : current ? "DOCUMENT_REPLACED" : "DOCUMENT_ATTACHED";
    const before = current ? { kind, fileName: current.file_name, ...(enrollment ? {
      status: row.status, fileId: current.file_id, sha256: current.sha256,
    } : {}) } : null;
    const after = { kind, fileName: asset.name, ...(enrollment ? { status: row.status, fileId, sha256: asset.digest } : {}) };
    const saved = await commitRequestRevision(command, action, row, {
      documents: current ? { update: [{ id: current.id, ...data }] } : { create: [data] },
    }, enrollment && !before ? { status: row.status } : before, after, now);
    await removeUnlinkedFile(fileId).catch(() => undefined);
    if (current) await removeUnlinkedFile(current.file_id).catch(() => undefined);
    return saved;
  } catch (error) {
    if (error instanceof LoanRequestError || error instanceof GovernmentLoansDirectusError && error.status < 500) {
      await removeUnlinkedFile(fileId).catch(() => undefined);
    }
    throw error;
  }
}

export async function saveRequestDocument(id: number, kind: DocumentKind, request: Request, actor: AgencyActor) {
  const saved = await saveLoanDocument(id, kind, request, actor, false);
  return getLoanRequest(saved.request_id);
}

export async function saveEnrollmentEvidence(id: number, kind: EnrollmentEvidenceKind, request: Request, actor: AgencyActor) {
  const saved = await saveLoanDocument(id, kind, request, actor, true);
  return { id: saved.request_id, revision: saved.revision };
}

export function parseEnrollmentEvidenceKind(value: string) {
  const parsed = enrollmentEvidenceKind.safeParse(value);
  if (!parsed.success) throw new LoanRequestError(404, "This enrollment document could not be found.");
  return parsed.data;
}

export async function downloadRequestDocument(id: number, kind: DocumentKind, filedOnly = false) {
  const request = await readRequest(id);
  if (filedOnly) assertFiledRequest(request);
  const document = (await readRequestDocuments(id)).find(item => item.kind === kind);
  if (!document) throw new LoanRequestError(404, "This request document could not be found.");
  return downloadLoanDocument(document);
}

export async function downloadEnrollmentEvidence(id: number, kind: EnrollmentEvidenceKind) {
  await readStagedEnrollment(id);
  const document = (await readRequestDocuments(id)).find(item => item.kind === kind);
  if (!document) throw new LoanRequestError(404, "This enrollment document could not be found.");
  return downloadLoanDocument(document);
}

export async function downloadLoanDocument(document: Pick<StoredLoanDocument, "file_id" | "file_name" | "mime_type" | "size_bytes">) {
  await privateRequestFolder();
  const bytes = await readCooperativeAsset(document.file_id, document.size_bytes);
  const filename = encodeURIComponent(document.file_name).replace(/['()*]/g, character =>
    "%" + character.charCodeAt(0).toString(16).toUpperCase());
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": document.mime_type, "Content-Length": String(bytes.byteLength),
      "Content-Disposition": "attachment; filename*=UTF-8''" + filename,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
