import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { CooperativeDocumentError, readCooperativeUpload } from "@/modules/financial-management/cooperative/server/document-input";
import { uploadCooperativeAsset } from "@/modules/financial-management/cooperative/server/document-storage";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { nextDisputeStatus, type DisputeStatus } from "../loans/lifecycle";
import type { AgencyActor } from "./agencies";
import { governmentLoansDirectus, GovernmentLoansDirectusError } from "./directus";
import { readOpenLoanMonth } from "./loan-changes";
import { readLoanSchedule, readMonthlyLoanSchedules } from "./loan-register";
import { loanCommand, loanCommandPartKey } from "./loan-requests";
import { payrollMonth, readPayrollPages } from "./payroll-month-store";
import { downloadLoanDocument, privateRequestFolder } from "./request-documents";
import { LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";
import { readStaffEvents, saveStaffEvent, staffEvent, staffEventReplay, type StaffEvent } from "./staff-events";

const fileSchema = z.object({ id: z.uuid(), name: z.string(), mime: z.enum(["application/pdf", "image/png", "image/jpeg"]), size: positiveId });
const details = z.object({
  loanReference: z.string(), employee: z.string(), month: payrollMonth, description: z.string(),
  evidence: fileSchema.nullable(), note: z.string().optional(),
});
const summary = (row: StaffEvent) => {
  const { evidence, ...data } = details.parse(row.detail);
  return { ...data, reference: row.reference, loanId: row.loan_id!, revision: row.revision,
    status: row.status as DisputeStatus, attachmentName: evidence?.name ?? null, author: row.actor_name, recordedAt: row.recorded_at };
};

const filterFor = (owner?: number) => ({ kind: { _eq: "DISPUTE" }, ...(owner === undefined ? {} : { employee_id: { _eq: owner } }) });
async function findDispute(reference: string, owner?: number) {
  const [row] = await readStaffEvents({ ...filterFor(owner), reference: { _eq: reference } }, 1, "-revision,id");
  if (!row) throw new LoanRequestError(404, "Dispute could not be found.");
  return row;
}

export async function readDisputes(params: URLSearchParams, owner?: number) {
  const { reference, download, filing, page, notesPage } = parseInput(z.object({
    reference: z.uuid().optional(), download: z.literal("1").optional(), filing: z.literal("1").optional(), page: pageNumber, notesPage: pageNumber,
  }), Object.fromEntries(params));
  if (filing && owner !== undefined) {
    const openMonth = await readOpenLoanMonth();
    const businessMonth = todayManila().slice(0, 7);
    const month = openMonth > businessMonth ? businessMonth : openMonth;
    const loans = await readMonthlyLoanSchedules(openMonth, owner);
    return { month, loans: loans.map(loan => ({ id: loan.row.id, reference: loan.reference, agency: loan.agency })) };
  }
  if (reference) {
    const current = await findDispute(reference, owner);
    const info = details.parse(current.detail);
    if (download) {
      if (!info.evidence) throw new LoanRequestError(404, "This dispute has no attachment.");
      return downloadLoanDocument({ file_id: info.evidence.id, file_name: info.evidence.name, mime_type: info.evidence.mime, size_bytes: info.evidence.size });
    }
    const versions = await readStaffEvents({ ...filterFor(owner), reference: { _eq: reference } }, 26, "-revision,id", (notesPage - 1) * 25);
    return { dispute: summary(current), history: versions.slice(0, 25).map(summary), hasMore: versions.length > 25 };
  }
  const roots = await readStaffEvents({ ...filterFor(owner), revision: { _eq: 1 } }, 26, "-recorded_at,id", (page - 1) * 25);
  const pageRoots = roots.slice(0, 25);
  const versions = pageRoots.length ? await readPayrollPages("government_loan_staff_events", staffEvent,
    Object.keys(staffEvent.shape).join(","), { ...filterFor(owner), reference: { _in: pageRoots.map(row => row.reference) } }, "-revision,id") : [];
  return { items: pageRoots.map(root => summary(versions.find(row => row.reference === root.reference) ?? root)), hasMore: roots.length > 25 };
}

const filingInput = z.object({ loanId: positiveId, month: payrollMonth, description: z.string().trim().min(1).max(1500) });
async function readFilingForm(request: Request) {
  const type = request.headers.get("Content-Type");
  if (!type || !/^multipart\/form-data;/i.test(type) || !request.body) {
    throw new LoanRequestError(400, "Submit the dispute as a form.");
  }
  const maxBytes = 5 * 1024 * 1024 + 32 * 1024;
  let bytes = 0;
  const bounded = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, stream) {
      bytes += chunk.length;
      if (bytes > maxBytes) throw new LoanRequestError(413, "Choose an attachment up to 5 MB.");
      stream.enqueue(chunk);
    },
  }));
  try {
    return await new Response(bounded, { headers: { "Content-Type": type } }).formData();
  } catch (error) {
    if (error instanceof LoanRequestError) throw error;
    throw new LoanRequestError(400, "Could not read the dispute form.");
  }
}

export async function fileDispute(request: Request, actor: AgencyActor) {
  const form = await readFilingForm(request);
  const input = parseInput(filingInput, Object.fromEntries(form));
  const key = parseInput(z.uuid(), request.headers.get("Idempotency-Key"));
  const files = form.getAll("attachment").filter(entry => !(entry instanceof File && !entry.name && entry.size === 0));
  if (files.length > 1 || files.some(file => !(file instanceof File) || file.size > 5 * 1024 * 1024)) {
    throw new LoanRequestError(422, "Choose one PDF, JPG, or PNG attachment up to 5 MB.");
  }
  const upload = new FormData();
  upload.set("uploadKey", key);
  upload.set("documentTypeId", "1");
  if (files[0]) upload.set("files", files[0]);
  const parsed = files.length ? await readCooperativeUpload(new Request("http://localhost/dispute", { method: "POST", body: upload }))
    .catch(error => {
      if (error instanceof CooperativeDocumentError) throw new LoanRequestError(error.status, error.message);
      throw error;
    }) : null;
  const file = parsed?.files[0];

  const command = loanCommand(key, { workflow: "posting-dispute", ...input, file: file ? [file.name, file.digest] : null }, actor, input.loanId);
  const previous = await staffEventReplay(command);
  if (previous) return summary(previous);
  const month = await readOpenLoanMonth();
  const loan = await readLoanSchedule(input.loanId, month, actor.actorId);
  if (input.month < loan.schedule.firstDeductionMonth || input.month > todayManila().slice(0, 7)) {
    throw new LoanRequestError(422, "Choose an applicable deduction month for this loan.");
  }
  const id = loanCommandPartKey(command.key, "posting-dispute");
  const fileId = file ? randomUUID() : null;
  const evidence = file && fileId ? { id: fileId, name: file.name, mime: file.mime, size: file.file.size } : null;
  const entry = { ...input, loanReference: loan.reference, employee: loan.employee, evidence };
  async function removeUnusedEvidence() {
    if (!fileId) return;
    const linked = await staffEventReplay(command);
    if (linked && details.parse(linked.detail).evidence?.id === fileId) return;
    await governmentLoansDirectus("/files/" + fileId, { method: "DELETE" });
  }
  try {
    if (file && fileId) await uploadCooperativeAsset(fileId, await privateRequestFolder(), file.file, file.mime,
      file.extension, "Government Loans posting dispute " + id);
    const result = await saveStaffEvent(command, { id, reference: id, event_key: id + ":1", kind: "DISPUTE",
      employee_id: actor.actorId, loan_id: input.loanId, revision: 1, status: "OPEN", detail: entry }, actor);
    if (fileId && details.parse(result.detail).evidence?.id !== fileId) await removeUnusedEvidence().catch(() => undefined);
    return summary(result);
  } catch (error) {
    if (error instanceof LoanRequestError || error instanceof GovernmentLoansDirectusError && error.status < 500) {
      await removeUnusedEvidence().catch(() => undefined);
    }
    throw error;
  }
}

const updateInput = z.object({ reference: z.uuid(), revision: positiveId,
  status: z.enum(["IN_PROGRESS", "RESOLVED"]), note: z.string().trim().min(1).max(1000) });
export async function updateDispute(body: unknown, key: string | null, actor: AgencyActor) {
  const data = parseInput(updateInput, body);
  const command = loanCommand(key, { workflow: "update-dispute", ...data }, actor);
  const prior = await staffEventReplay(command);
  if (prior) return summary(prior);
  const row = await findDispute(data.reference);
  if (row.revision !== data.revision || nextDisputeStatus[row.status as DisputeStatus] !== data.status) {
    throw new LoanRequestError(409, "Reload the dispute and choose its next status.");
  }
  const revision = row.revision + 1;
  const result = await saveStaffEvent(command, {
    id: loanCommandPartKey(command.key, "dispute-note"), reference: row.reference, kind: "DISPUTE",
    event_key: row.reference + ":" + revision, employee_id: row.employee_id, loan_id: row.loan_id, revision,
    status: data.status, detail: { ...row.detail, note: data.note },
  }, actor);
  return summary(result);
}
