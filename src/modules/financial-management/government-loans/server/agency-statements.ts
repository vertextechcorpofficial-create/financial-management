import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CooperativeDocumentError, readCooperativeUpload } from "@/modules/financial-management/cooperative/server/document-input";
import { uploadCooperativeAsset } from "@/modules/financial-management/cooperative/server/document-storage";
import { exactMoney } from "../enrollment/rules";
import { statementSources } from "../loans/types";
import type { AgencyActor } from "./agencies";
import { GOVERNMENT_LOAN_AGENCY_STATEMENTS, GovernmentLoansDirectusError, governmentLoansDirectus } from "./directus";
import { readEnrollmentRows } from "./enrollment-sources";
import { readRegisterLoan, statementAmount } from "./loan-register";
import { commitRequestRevision, loanCommand, loanCommandPartKey, readCommandReceipt } from "./loan-requests";
import { downloadLoanDocument, privateRequestFolder } from "./request-documents";
import { LoanRequestError, parseInput, positiveId } from "./request-input";

const maxFileBytes = 5 * 1024 * 1024;
const maxBodyBytes = maxFileBytes + 32 * 1024;
const amount = z.string().trim().regex(statementAmount, "Enter a nonnegative balance with up to two decimal places.").transform(exactMoney);
const statementInput = z.object({
  date: z.iso.date({ error: "Enter a valid statement date." }),
  balance: amount, source: z.enum(statementSources, { error: "Choose a statement source." }),
  note: z.string().trim().max(500).transform(value => value || null),
});
const savedStatement = z.object({ statementId: z.uuid(), fileId: z.uuid().nullable() });
const tooLarge = () => new LoanRequestError(413, "Choose a statement attachment of 5 MB or less.");

async function statementForm(request: Request) {
  const contentType = request.headers.get("Content-Type");
  if (!contentType || !/^multipart\/form-data;/i.test(contentType) || !request.body) {
    throw new LoanRequestError(400, "Send the agency statement as a form.");
  }
  if (Number(request.headers.get("Content-Length")) > maxBodyBytes) throw tooLarge();
  let size = 0;
  const body = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > maxBodyBytes) throw tooLarge();
      controller.enqueue(chunk);
    },
  }));
  try {
    return await new Response(body, { headers: { "Content-Type": contentType } }).formData();
  } catch (error) {
    if (error instanceof LoanRequestError) throw error;
    throw new LoanRequestError(400, "The agency statement form could not be read.");
  }
}

async function validateAttachment(attachments: FormDataEntryValue[], key: string) {
  if (!attachments.length) return null;
  const [file] = attachments;
  if (attachments.length > 1 || !(file instanceof File)) throw new LoanRequestError(422, "Choose one statement attachment.");
  if (file.size > maxFileBytes) throw tooLarge();

  const upload = new FormData();
  upload.set("uploadKey", key);
  upload.set("documentTypeId", "1");
  upload.set("files", file);
  try {
    const { files } = await readCooperativeUpload(new Request("http://localhost/statement", { method: "POST", body: upload }));
    return files[0];
  } catch (error) {
    if (error instanceof CooperativeDocumentError) throw new LoanRequestError(error.status, error.message);
    throw error;
  }
}

async function removeUnusedAttachment(fileId: string) {
  const linked = await readEnrollmentRows(GOVERNMENT_LOAN_AGENCY_STATEMENTS, z.object({ id: z.uuid() }), "id",
    { file_id: { _eq: fileId } }, 1);
  if (!linked.length) await governmentLoansDirectus("/files/" + fileId, { method: "DELETE" });
}

export async function recordAgencyStatement(id: number, request: Request, actor: AgencyActor) {
  const expectedRevision = parseInput(positiveId, request.headers.get("If-Match"));
  const key = parseInput(z.uuid(), request.headers.get("Idempotency-Key"));
  const form = await statementForm(request);
  const input = parseInput(statementInput, {
    date: form.get("date"), balance: form.get("balance"), source: form.get("source"), note: form.get("note") ?? "",
  });
  const attachment = await validateAttachment(form.getAll("attachment"), key);
  const command = loanCommand(key, { action: "record-agency-statement", expectedRevision, ...input,
    attachment: attachment ? { name: attachment.name, sha256: attachment.digest } : null }, actor, id);
  const existing = await readCommandReceipt(command);
  if (existing) return { revision: existing.revision, statementId: savedStatement.parse(existing.after_values).statementId };

  const { loan, businessDate } = await readRegisterLoan(id);
  if (!loan.active) throw new LoanRequestError(409, "Agency statements can be recorded for active loans.");
  if (loan.revision !== expectedRevision) throw new LoanRequestError(409, "The loan changed. Reload it before recording a statement.");
  if (input.date > businessDate || input.date.startsWith("0000-")) {
    throw new LoanRequestError(422, "Enter a statement date on or before today.", { date: "Use a valid Manila business date." });
  }
  const statementId = loanCommandPartKey(command.key, "agency-statement");
  const fileId = attachment ? randomUUID() : null;
  const now = new Date().toISOString();

  try {
    if (attachment && fileId) {
      await uploadCooperativeAsset(fileId, await privateRequestFolder(), attachment.file,
        attachment.mime, attachment.extension, "Government Loans agency statement " + id);
    }
    const statement = {
      id: statementId, statement_date: input.date, balance: input.balance, source: input.source, note: input.note,
      recorded_user_id: actor.actorId, recorded_by: actor.actorName, recorded_at: now, recorded_revision: loan.revision + 1,
      file_id: fileId, file_name: attachment?.name ?? null, mime_type: attachment?.mime ?? null,
      size_bytes: attachment?.file.size ?? null, sha256: attachment?.digest ?? null,
    };
    const saved = await commitRequestRevision(command, "AGENCY_BALANCE_RECORDED", { id, revision: loan.revision, status: "ACTIVE" },
      { agency_statements: { create: [statement] } }, { status: "ACTIVE", statement: loan.agencyBalance.latest },
      { status: "ACTIVE", statementId, fileId, ...input, fileName: attachment?.name ?? null,
        sha256: attachment?.digest ?? null, remarks: input.date + " · ₱" + input.balance + " · " + input.source }, now);
    const result = savedStatement.parse(saved.after_values);
    if (fileId && result.fileId !== fileId) await removeUnusedAttachment(fileId).catch(() => undefined);
    return { revision: saved.revision, statementId: result.statementId };
  } catch (error) {
    // For an uncertain response the original write may still be completing.
    if (fileId && (error instanceof LoanRequestError || error instanceof GovernmentLoansDirectusError && error.status < 500)) {
      await removeUnusedAttachment(fileId).catch(() => undefined);
    }
    throw error;
  }
}

const statementFile = z.object({
  file_id: z.uuid().nullable(), file_name: z.string().nullable(),
  mime_type: z.enum(["application/pdf", "image/png", "image/jpeg"]).nullable(),
  size_bytes: z.number().int().positive().max(maxFileBytes).nullable(),
});

export async function downloadAgencyStatement(id: number, reference: string) {
  const parsed = z.uuid().safeParse(reference);
  if (!parsed.success) throw new LoanRequestError(404, "Statement attachment could not be found.");
  const [file] = await readEnrollmentRows(GOVERNMENT_LOAN_AGENCY_STATEMENTS, statementFile,
    Object.keys(statementFile.shape).join(","), { id: { _eq: parsed.data }, request_id: { _eq: id } }, 1);
  if (!file?.file_id || !file.file_name || !file.mime_type || !file.size_bytes) {
    throw new LoanRequestError(404, "Statement attachment could not be found.");
  }
  return downloadLoanDocument({ file_id: file.file_id, file_name: file.file_name, mime_type: file.mime_type, size_bytes: file.size_bytes });
}
