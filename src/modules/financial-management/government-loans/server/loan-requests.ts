import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { canCancelRequest } from "../requests/request-rules";
import {
  documentKinds, enrollmentEvidenceKinds, requestDecisionLabels, requestSorts, requestStatusLabels, requestViews,
  type DocumentKind, type EnrollmentEvidenceKind, type LoanDocumentKind, type LoanRequest, type RequestAssessment, type RequestDecision, type RequestForm, type RequestListItem, type RequestPage, type RequestSort, type RequestSummary,
  type RequestStatus, type RequestView,
} from "../requests/types";
import type { AgencyActor } from "./agencies";
import { assessRequest } from "./request-assessment";
import {
  GOVERNMENT_LOAN_REQUESTS, GOVERNMENT_LOAN_REQUEST_DOCUMENTS, GOVERNMENT_LOAN_REQUEST_HISTORY, GovernmentLoansDirectusError,
  readGovernmentLoansItems, writeGovernmentLoansItem,
} from "./directus";
import {
  addRequestInput, cancelRequestInput, employeeRequestForm, invalidDraftFields, LoanRequestError, pageNumber, parseInput, positiveId, requestForm,
  submitRequestInput, updateRequestInput,
} from "./request-input";

const statuses = z.enum(Object.keys(requestStatusLabels) as RequestStatus[]);
const views = z.enum(Object.keys(requestViews) as RequestView[]);
const decisionActions = z.enum(Object.keys(requestDecisionLabels) as RequestDecision["action"][]);
export const documentKind = z.enum(Object.keys(documentKinds) as DocumentKind[]);
export const enrollmentEvidenceKind = z.enum(Object.keys(enrollmentEvidenceKinds) as EnrollmentEvidenceKind[]);
const allDocumentKinds = { ...documentKinds, ...enrollmentEvidenceKinds };
const documentRow = z.object({
  id: positiveId, request_id: positiveId, kind: z.enum(Object.keys(allDocumentKinds) as LoanDocumentKind[]),
  file_id: z.uuid(), file_name: z.string(), sha256: z.string().regex(/^[0-9a-f]{64}$/i),
  mime_type: z.enum(["application/pdf", "image/png", "image/jpeg"]), size_bytes: z.number().int().positive(),
});
export type StoredLoanDocument = z.output<typeof documentRow>;
export const requestRow = z.object({
  id: positiveId, status: statuses, revision: positiveId, form: requestForm,
  employee_name: z.string().nullable(), agency_name: z.string().nullable(),
  missing_fields: z.partialRecord(z.enum(Object.keys(requestForm.shape) as Array<keyof RequestForm>), z.string()),
  updated_at: z.string(), requested_at: z.string().nullable(),
});
export const requestDetailRow = requestRow.extend({ filed_assessment: z.custom<LoanRequest["filedAssessment"]>() });
const decisionRow = z.object({
  id: positiveId, action: decisionActions, actor_name: z.string(), occurred_at: z.string(),
  before_values: z.object({ status: statuses }).nullable(),
  after_values: z.object({ status: statuses, reason: z.string().nullish(), remarks: z.string().nullish() }),
});
const listFields = Object.keys(requestRow.shape).join(",");
const detailFields = Object.keys(requestDetailRow.shape).join(",");
const documentFields = Object.keys(documentRow.shape).join(",");
export const referenceFor = (id: number) => "GLR-" + String(id).padStart(6, "0");

type Stored = z.output<typeof requestDetailRow>;
type RevisionSource = Pick<Stored, "id" | "revision" | "status">;
type Operation = RequestDecision["action"] | "DRAFT_CREATED" | "DRAFT_SAVED" | "DOCUMENT_ATTACHED" | "DOCUMENT_REPLACED";

export function requestId(value: string) {
  const parsed = positiveId.safeParse(value);
  if (!parsed.success) throw new LoanRequestError(404, "Loan request could not be found.");
  return parsed.data;
}

export function isoDateTime(value: string) {
  return value.endsWith("Z") || /[+-]\d\d:\d\d$/.test(value) ? value : value + "Z";
}

function listItem(row: z.output<typeof requestRow>): RequestListItem {
  return {
    id: row.id, reference: referenceFor(row.id), status: row.status, revision: row.revision,
    employeeName: row.employee_name, agencyName: row.agency_name, program: row.form.program, amount: row.form.amount,
    missing: row.missing_fields, updatedAt: isoDateTime(row.updated_at),
    requestedAt: row.requested_at ? isoDateTime(row.requested_at) : null,
  };
}

export async function readRequest(id: number, owner?: number) {
  const filter = { id: { _eq: id }, ...(owner === undefined ? {} : { employee_user_id: { _eq: owner } }) };
  const query = new URLSearchParams({ fields: detailFields, filter: JSON.stringify(filter), limit: "1" });
  const { data } = z.object({ data: z.array(requestDetailRow).max(1) }).parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUESTS, query));
  if (!data[0] || (owner !== undefined && data[0].form.employeeId !== owner)) {
    throw new LoanRequestError(404, "Loan request could not be found.");
  }
  return data[0];
}

export function assertFiledRequest(row: Stored) {
  if (row.status === "DRAFT" || !row.requested_at) throw new LoanRequestError(404, "Filed loan request could not be found.");
  return row;
}

export async function readLoanDocuments(ids: number[]): Promise<StoredLoanDocument[]> {
  if (!ids.length) return [];
  const filter = { request_id: { _in: ids } };
  const limit = Math.min(ids.length * Object.keys(allDocumentKinds).length + 1, 50);
  const documents: StoredLoanDocument[] = [];
  for (let offset = 0; ; offset += limit) {
    const query = new URLSearchParams({ fields: documentFields, filter: JSON.stringify(filter),
      sort: "id", limit: String(limit), offset: String(offset) });
    const { data } = z.object({ data: z.array(documentRow).max(limit) })
      .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUEST_DOCUMENTS, query));
    documents.push(...data);
    if (data.length < limit) return documents;
  }
}

export const readRequestDocuments = (id: number) => readLoanDocuments([id]);

async function readRequestDecisions(id: number, revision: number): Promise<RequestDecision[]> {
  const query = new URLSearchParams({ fields: Object.keys(decisionRow.shape).join(","), sort: "-revision,-id", limit: "25",
    filter: JSON.stringify({ request_id: { _eq: id }, revision: { _lte: revision }, action: { _in: decisionActions.options } }) });
  const { data } = z.object({ data: z.array(decisionRow) }).parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUEST_HISTORY, query));
  return data.reverse().map(event => ({
    id: event.id, action: event.action, actorName: event.actor_name, occurredAt: isoDateTime(event.occurred_at),
    fromStatus: event.before_values?.status ?? null, toStatus: event.after_values.status,
    reason: event.after_values.reason ?? null,
    remarks: event.after_values.remarks ?? null,
  }));
}

export async function requestDetails(row: Stored, documents?: StoredLoanDocument[]): Promise<LoanRequest> {
  const [storedDocuments, decisionHistory] = await Promise.all([
    documents ?? readRequestDocuments(row.id),
    row.status === "DRAFT" ? [] : readRequestDecisions(row.id, row.revision),
  ]);
  return { ...listItem(row), form: row.form, documents: storedDocuments.flatMap(document => {
    const kind = documentKind.safeParse(document.kind);
    return kind.success ? [{ id: document.id, kind: kind.data, name: document.file_name, size: document.size_bytes }] : [];
  }), filedAssessment: row.filed_assessment, decisionHistory };
}

export async function getLoanRequest(id: number, owner?: number): Promise<LoanRequest> {
  const row = await readRequest(id, owner);
  if (!row.requested_at && row.status !== "DRAFT") throw new LoanRequestError(404, "Loan request could not be found.");
  return requestDetails(row);
}

const listQuery = z.object({
  status: statuses.optional(), view: views.optional(), q: z.string().trim().max(120).default(""),
  agency: positiveId.optional(), page: pageNumber,
  sort: z.enum(Object.keys(requestSorts) as [RequestSort, ...RequestSort[]]).default("filed"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  size: z.coerce.number().int().refine(value => [10, 25, 50].includes(value)).default(25),
});
const summaryRow = z.object({ status: statuses, count: z.object({ id: z.coerce.number().int().nonnegative() }) });
async function requestSummary(owner: number | undefined, agency: number | undefined): Promise<RequestSummary> {
  const summary = Object.fromEntries(Object.keys(requestStatusLabels).map(status => [status, 0])) as RequestSummary;
  const filter = {
    ...(agency ? { agency_id: { _eq: agency } } : {}),
    ...(owner === undefined ? {} : { employee_user_id: { _eq: owner } }),
    _and: [{ _or: [{ requested_at: { _nnull: true } }, { status: { _eq: "DRAFT" } }] }],
  };
  const query = new URLSearchParams({ "groupBy[]": "status", "aggregate[count]": "id", limit: "100", filter: JSON.stringify(filter) });
  try {
    const { data } = z.object({ data: z.array(summaryRow) }).parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUESTS, query));
    for (const row of data) summary[row.status] = row.count.id;
  } catch {
    // Summary counts are supplementary; keep the request list available if they fail.
  }
  return summary;
}

const requestSortValue = (row: RequestListItem, key: RequestSort): string | number | null => {
  switch (key) {
    case "reference": return row.id;
    case "employee": return row.employeeName;
    case "agency": return row.agencyName;
    case "program": return row.program;
    case "amount": return row.amount ? Math.round(Number(row.amount) * 100) : null;
    case "filed": return row.requestedAt;
    case "updated": return row.updatedAt;
    case "status": return requestStatusLabels[row.status];
  }
};

function sortRequests(rows: RequestListItem[], key: RequestSort, direction: "asc" | "desc") {
  rows.sort((left, right) => {
    const a = requestSortValue(left, key);
    const b = requestSortValue(right, key);
    if (a === null || b === null) return a === b ? right.id - left.id : a === null ? 1 : -1;
    const order = typeof a === "number" && typeof b === "number" ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true });
    return (direction === "asc" ? order : -order) || right.id - left.id;
  });
}

async function readAllRequests(filter: object) {
  const rows: z.output<typeof requestRow>[] = [];
  for (let offset = 0; ; offset += 50) {
    const query = new URLSearchParams({ fields: listFields, filter: JSON.stringify(filter), limit: "50",
      offset: String(offset), sort: "-id" });
    const { data } = z.object({ data: z.array(requestRow).max(50) })
      .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUESTS, query));
    rows.push(...data);
    if (data.length < 50) return rows;
  }
}

export async function listLoanRequests(params: URLSearchParams, owner?: number): Promise<RequestPage> {
  const { status, view, q, agency, page, sort, direction, size } = parseInput(listQuery, Object.fromEntries(params));
  const ref = /^(?:GLR-)?0*([1-9]\d{0,9})$/i.exec(q)?.[1];
  const statusFilter = view
    ? { _in: requestViews[view].statuses, ...(status ? { _eq: status } : {}) }
    : { _eq: status ?? "DRAFT" };
  const filter = {
    status: statusFilter, ...(agency ? { agency_id: { _eq: agency } } : {}),
    ...(owner === undefined ? {} : { employee_user_id: { _eq: owner } }),
    _and: [{ _or: [{ requested_at: { _nnull: true } }, { status: { _eq: "DRAFT" } }] }],
    ...(q ? { _or: [{ employee_name: { _icontains: q } }, { agency_name: { _icontains: q } },
      ...(ref ? [{ id: { _eq: Number(ref) } }] : [])] } : {}),
  };
  const rows = (await readAllRequests(filter)).map(listItem);
  const requestedSort: RequestSort = view === "drafts" || (!view && (!status || status === "DRAFT")) ? "updated" : "filed";
  sortRequests(rows, params.has("sort") ? sort : requestedSort, direction);
  const start = (page - 1) * size;
  return {
    items: rows.slice(start, start + size), total: rows.length, pageSize: size, hasMore: rows.length > start + size,
    summary: await requestSummary(owner, agency),
  };
}

type Command = { key: string; hash: string; actor: AgencyActor; id?: number };
export function loanCommand(key: string | null, payload: object, actor: AgencyActor, id?: number): Command {
  const parsed = z.uuid().safeParse(key);
  if (!parsed.success) throw new LoanRequestError(400, "Include a valid request key.");
  return {
    key: parsed.data.toLowerCase(), actor, id,
    hash: createHash("sha256").update(JSON.stringify([id ?? null, payload])).digest("hex"),
  };
}

export function loanCommandPartKey(key: string, part: number | string) {
  const hash = createHash("sha256").update(key + ":" + part).digest("hex");
  return hash.slice(0, 8) + "-" + hash.slice(8, 12) + "-8" + hash.slice(13, 16) + "-a" + hash.slice(17, 20) + "-" + hash.slice(20, 32);
}

const storedCommand = z.object({
  request_id: positiveId, revision: positiveId, actor_user_id: positiveId, request_hash: z.string(),
  action: z.string(), after_values: z.unknown(),
});
type CommandReceipt = Pick<z.infer<typeof storedCommand>, "request_id" | "revision" | "action" | "after_values">;

export async function readCommandReceipt(command: Command) {
  const query = new URLSearchParams({ fields: Object.keys(storedCommand.shape).join(","), limit: "1",
    filter: JSON.stringify({ command_key: { _eq: command.key } }) });
  const { data: [receipt] } = z.object({ data: z.array(storedCommand).max(1) })
    .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUEST_HISTORY, query));
  if (!receipt) return null;
  if (receipt.actor_user_id !== command.actor.actorId || receipt.request_hash !== command.hash ||
    (command.id !== undefined && receipt.request_id !== command.id)) {
    throw new LoanRequestError(409, "This request key was already used.");
  }
  return receipt;
}

export async function replayCommand(command: Command, owner?: number) {
  const receipt = await readCommandReceipt(command);
  return receipt ? getLoanRequest(receipt.request_id, owner) : null;
}

const staleDraft = () => new LoanRequestError(409, "This draft changed. Reopen it before making another update.");
const staleRequest = () => new LoanRequestError(409, "This request changed. Reload it to see its current status.");
export function assertDraft(row: Stored, expectedRevision: number) {
  if (row.status !== "DRAFT" || row.revision !== expectedRevision) throw staleDraft();
}

function commandEvent(command: Command, action: string, revision: number, revisionKey: string,
  before: object | null, after: object, now: string) {
  const { actor } = command;
  return {
    revision, revision_key: revisionKey, command_key: command.key, request_hash: command.hash,
    action, actor_user_id: actor.actorId, actor_name: actor.actorName, actor_role: actor.actorRole,
    occurred_at: now, before_values: before, after_values: after,
  };
}

async function receiptAfterWriteError(command: Command) {
  return readCommandReceipt(command).catch(error => {
    if (error instanceof LoanRequestError) throw error;
    return null;
  });
}

export function requestRevisionValues(command: Command, action: Operation, current: RevisionSource | null,
  data: object, before: object | null, after: object, now: string) {
  const revision = (current?.revision ?? 0) + 1;
  return {
    ...data, revision, updated_at: now,
    history_entries: { create: [commandEvent(command, action, revision,
      current ? current.id + ":" + revision : "create:" + command.key, before, after, now)] },
  };
}

export async function commitRequestRevision(command: Command, action: Operation, current: RevisionSource | null,
  data: object, before: object | null, after: object, now = new Date().toISOString(),
  periodCommand?: { month: string; sequence: number; revision_key: string }): Promise<CommandReceipt> {
  const patch = requestRevisionValues(command, action, current, data, before, after, now);
  if (periodCommand) Object.assign(patch.history_entries.create[0], { period_command_id: periodCommand });
  try {
    const { data: saved } = z.object({ data: z.object({ id: positiveId }) }).parse(
      await writeGovernmentLoansItem(GOVERNMENT_LOAN_REQUESTS, patch, "id", current?.id),
    );
    return { request_id: saved.id, revision: patch.revision, action, after_values: after };
  } catch (error) {
    const replay = await receiptAfterWriteError(command);
    if (replay) return replay;
    if (error instanceof GovernmentLoansDirectusError && error.code === "RECORD_NOT_UNIQUE") {
      throw current && current.status !== "DRAFT" ? staleRequest() : staleDraft();
    }
    throw error;
  }
}

export async function writeRequestRevision(command: Command, action: Operation, current: Stored | null,
  data: object, before: object | null, after: object, now?: string, owner?: number) {
  const receipt = await commitRequestRevision(command, action, current, data, before, after, now);
  return getLoanRequest(receipt.request_id, owner);
}

type LoanBatchAction = "BULK_APPROVAL_STARTED" | "BULK_APPROVAL_SKIPPED" | "BULK_APPROVAL_COMPLETED" |
  "BULK_VERIFICATION_STARTED" | "BULK_VERIFICATION_SKIPPED" | "BULK_VERIFICATION_COMPLETED";
export async function recordLoanBatchEvent(command: Command, action: LoanBatchAction,
  request: Pick<Stored, "id" | "revision">, result: object): Promise<CommandReceipt> {
  const entry = commandEvent(command, action, request.revision, "bulk:" + command.key, null, result, new Date().toISOString());
  try {
    await writeGovernmentLoansItem(GOVERNMENT_LOAN_REQUEST_HISTORY, { request_id: request.id, ...entry }, "id");
    return { request_id: request.id, revision: request.revision, action, after_values: result };
  } catch (error) {
    const replay = await receiptAfterWriteError(command);
    if (replay) return replay;
    throw error;
  }
}

function draftValues(form: RequestForm, assessment: RequestAssessment) {
  return {
    form, employee_user_id: form.employeeId, employee_name: assessment.employee?.name ?? null,
    agency_id: assessment.agency?.id ?? null, agency_name: assessment.agency?.name ?? null,
    missing_fields: assessment.fieldErrors,
  };
}

export async function saveLoanRequest(body: unknown, key: string | null, actor: AgencyActor, id?: number, owner?: number) {
  const input = id === undefined
    ? { ...parseInput(addRequestInput, body), expectedRevision: null }
    : parseInput(updateRequestInput, body);
  const owned = id === undefined || owner === undefined ? null : await readRequest(id, owner);
  const form = owner === undefined ? input.form : employeeRequestForm(input.form, owner);
  const command = loanCommand(key, { action: "save", ...input, form }, actor, id);
  const replay = await replayCommand(command, owner);
  if (replay) return replay;
  const current = owned ?? (id === undefined ? null : await readRequest(id));
  if (current) assertDraft(current, input.expectedRevision!);
  const invalid = invalidDraftFields(form);
  if (Object.keys(invalid).length) throw new LoanRequestError(422, "Check the request fields.", invalid);
  const assessment = await assessRequest(form);
  const values = draftValues(form, assessment);
  const now = new Date().toISOString();
  return writeRequestRevision(command, current ? "DRAFT_SAVED" : "DRAFT_CREATED", current, {
    ...values, status: "DRAFT", ...(current ? {} : { created_by_user_id: actor.actorId, created_at: now }),
  }, current ? { form: current.form } : null, { form }, now, owner);
}

export async function submitLoanRequest(id: number, body: unknown, key: string | null, actor: AgencyActor, owner?: number) {
  const input = parseInput(submitRequestInput, body);
  const owned = owner === undefined ? null : await readRequest(id, owner);
  const command = loanCommand(key, { action: "submit", ...input }, actor, id);
  const replay = await replayCommand(command, owner);
  if (replay) return replay;
  const current = owned ?? await readRequest(id);
  assertDraft(current, input.expectedRevision);
  const form = current.form;
  const assessment = await assessRequest(form);
  if (Object.keys(assessment.fieldErrors).length) {
    throw new LoanRequestError(422, "Complete the required request fields.", assessment.fieldErrors);
  }
  const filed = { capacity: assessment.capacity, checks: assessment.checks };
  const consent = {
    employeeId: form.employeeId, agencyId: form.agencyId,
    deduction: form.deductionConsent, dataSharing: form.dataSharingConsent,
  };
  const now = new Date().toISOString();
  return writeRequestRevision(command, "REQUEST_SUBMITTED", current, {
    ...draftValues(form, assessment), status: "REQUESTED", requested_at: now, requested_by_user_id: actor.actorId,
    filed_assessment: filed, consent_snapshot: consent,
  }, { status: current.status }, { status: "REQUESTED", consent, ...filed }, now, owner);
}

export async function cancelLoanRequest(id: number, body: unknown, key: string | null, actor: AgencyActor, owner?: number) {
  const { expectedRevision, reason: suppliedReason } = parseInput(cancelRequestInput, body);
  const owned = owner === undefined ? null : await readRequest(id, owner);
  const reason = suppliedReason || null;
  const command = loanCommand(key, { action: "cancel", expectedRevision, reason }, actor, id);
  const replay = await replayCommand(command, owner);
  if (replay) return replay;

  const current = owned ?? await readRequest(id);
  if (current.revision !== expectedRevision) throw staleRequest();
  if (!canCancelRequest(current.status)) {
    throw new LoanRequestError(409, "Only requested or approved loans can be cancelled before enrollment.");
  }
  return writeRequestRevision(command, "REQUEST_CANCELLED", current, { status: "CANCELLED" },
    { status: current.status }, { status: "CANCELLED", reason }, undefined, owner);
}
