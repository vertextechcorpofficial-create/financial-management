import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { canCancelRequest } from "../requests/request-rules";
import {
  documentKinds, requestDecisionLabels, requestStatusLabels, requestViews,
  type DocumentKind, type LoanRequest, type RequestAssessment, type RequestDecision, type RequestForm, type RequestListItem,
  type RequestStatus, type RequestView,
} from "../requests/types";
import type { AgencyActor } from "./agencies";
import { assessRequest } from "./request-assessment";
import {
  GOVERNMENT_LOAN_REQUESTS, GOVERNMENT_LOAN_REQUEST_DOCUMENTS, GOVERNMENT_LOAN_REQUEST_HISTORY, GovernmentLoansDirectusError,
  readGovernmentLoansItems, writeGovernmentLoansItem,
} from "./directus";
import {
  addRequestInput, cancelRequestInput, invalidDraftFields, LoanRequestError, pageNumber, parseInput, positiveId, requestForm,
  submitRequestInput, updateRequestInput,
} from "./request-input";

const statuses = z.enum(Object.keys(requestStatusLabels) as RequestStatus[]);
const views = z.enum(Object.keys(requestViews) as RequestView[]);
const decisionActions = z.enum(Object.keys(requestDecisionLabels) as RequestDecision["action"][]);
export const documentKind = z.enum(Object.keys(documentKinds) as DocumentKind[]);
const documentRow = z.object({
  id: positiveId, request_id: positiveId, kind: documentKind, file_id: z.uuid(), file_name: z.string(),
  mime_type: z.enum(["application/pdf", "image/png", "image/jpeg"]), size_bytes: z.number().int().positive(),
});
const requestRow = z.object({
  id: positiveId, status: statuses, revision: positiveId, form: requestForm,
  employee_name: z.string().nullable(), agency_name: z.string().nullable(),
  missing_fields: z.partialRecord(z.enum(Object.keys(requestForm.shape) as Array<keyof RequestForm>), z.string()),
  updated_at: z.string(), requested_at: z.string().nullable(),
});
const detailRow = requestRow.extend({ filed_assessment: z.custom<LoanRequest["filedAssessment"]>() });
const decisionRow = z.object({
  id: positiveId, action: decisionActions, actor_name: z.string(), occurred_at: z.string(),
  before_values: z.object({ status: statuses }).nullable(),
  after_values: z.object({ status: statuses, reason: z.string().nullish() }),
});
const listFields = Object.keys(requestRow.shape).join(",");
const detailFields = Object.keys(detailRow.shape).join(",");
const documentFields = Object.keys(documentRow.shape).join(",");
const referenceFor = (id: number) => "GLR-" + String(id).padStart(6, "0");

type Stored = z.output<typeof detailRow>;
type Operation = RequestDecision["action"] | "DRAFT_CREATED" | "DRAFT_SAVED" | "DOCUMENT_ATTACHED" | "DOCUMENT_REPLACED";

export function requestId(value: string) {
  const parsed = positiveId.safeParse(value);
  if (!parsed.success) throw new LoanRequestError(404, "Loan request could not be found.");
  return parsed.data;
}

function isoDateTime(value: string) {
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

export async function readRequest(id: number) {
  const query = new URLSearchParams({ fields: detailFields, filter: JSON.stringify({ id: { _eq: id } }), limit: "1" });
  const { data } = z.object({ data: z.array(detailRow).max(1) }).parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUESTS, query));
  if (!data[0]) throw new LoanRequestError(404, "Loan request could not be found.");
  return data[0];
}

export async function readRequestDocuments(id: number) {
  const query = new URLSearchParams({ fields: documentFields, filter: JSON.stringify({ request_id: { _eq: id } }),
    sort: "id", limit: String(Object.keys(documentKinds).length + 1) });
  const { data } = z.object({ data: z.array(documentRow).max(Object.keys(documentKinds).length) })
    .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUEST_DOCUMENTS, query));
  return data;
}

async function readRequestDecisions(id: number, revision: number): Promise<RequestDecision[]> {
  const query = new URLSearchParams({ fields: Object.keys(decisionRow.shape).join(","), sort: "revision,id", limit: "25",
    filter: JSON.stringify({ request_id: { _eq: id }, revision: { _lte: revision }, action: { _in: decisionActions.options } }) });
  const { data } = z.object({ data: z.array(decisionRow) }).parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUEST_HISTORY, query));
  return data.map(event => ({
    id: event.id, action: event.action, actorName: event.actor_name, occurredAt: isoDateTime(event.occurred_at),
    fromStatus: event.before_values?.status ?? null, toStatus: event.after_values.status,
    reason: event.after_values.reason ?? null,
  }));
}

export async function getLoanRequest(id: number): Promise<LoanRequest> {
  const row = await readRequest(id);
  const [documents, decisionHistory] = await Promise.all([
    readRequestDocuments(id),
    row.status === "DRAFT" ? [] : readRequestDecisions(id, row.revision),
  ]);
  return { ...listItem(row), form: row.form, documents: documents.map(document => ({
    id: document.id, kind: document.kind, name: document.file_name, size: document.size_bytes,
  })), filedAssessment: row.filed_assessment, decisionHistory };
}

const listQuery = z.object({
  status: statuses.optional(), view: views.optional(), q: z.string().trim().max(120).default(""),
  agency: positiveId.optional(), page: pageNumber,
});
export async function listLoanRequests(params: URLSearchParams) {
  const { status, view, q, agency, page } = parseInput(listQuery, Object.fromEntries(params));
  const ref = /^(?:GLR-)?0*([1-9]\d{0,9})$/i.exec(q)?.[1];
  const statusFilter = view
    ? { _in: requestViews[view].statuses, ...(status ? { _eq: status } : {}) }
    : { _eq: status ?? "DRAFT" };
  const filter = {
    status: statusFilter, ...(agency ? { agency_id: { _eq: agency } } : {}),
    ...(q ? { _or: [{ employee_name: { _icontains: q } }, { agency_name: { _icontains: q } },
      ...(ref ? [{ id: { _eq: Number(ref) } }] : [])] } : {}),
  };
  const limit = 25;
  const query = new URLSearchParams({
    fields: listFields, filter: JSON.stringify(filter), limit: String(limit + 1), offset: String((page - 1) * limit),
    sort: (view ? view === "in-progress" : status && status !== "DRAFT") ? "-requested_at,-id" : "-updated_at,-id",
  });
  const { data } = z.object({ data: z.array(requestRow).max(limit + 1) }).parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUESTS, query));
  return { items: data.slice(0, limit).map(listItem), hasMore: data.length > limit };
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

const storedCommand = z.object({ request_id: positiveId, actor_user_id: positiveId, request_hash: z.string() });
export async function replayCommand(command: Command) {
  const query = new URLSearchParams({ fields: Object.keys(storedCommand.shape).join(","), limit: "1",
    filter: JSON.stringify({ command_key: { _eq: command.key } }) });
  const { data: [receipt] } = z.object({ data: z.array(storedCommand).max(1) })
    .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUEST_HISTORY, query));
  if (!receipt) return null;
  if (receipt.actor_user_id !== command.actor.actorId || receipt.request_hash !== command.hash ||
    (command.id !== undefined && receipt.request_id !== command.id)) {
    throw new LoanRequestError(409, "This request key was already used.");
  }
  return getLoanRequest(receipt.request_id);
}

const staleDraft = () => new LoanRequestError(409, "This draft changed. Reopen it before making another update.");
const staleRequest = () => new LoanRequestError(409, "This request changed. Reload it to see its current status.");
export function assertDraft(row: Stored, expectedRevision: number) {
  if (row.status !== "DRAFT" || row.revision !== expectedRevision) throw staleDraft();
}

export async function writeRequestRevision(command: Command, action: Operation, current: Stored | null,
  data: object, before: object | null, after: object, now = new Date().toISOString()) {
  const revision = (current?.revision ?? 0) + 1;
  const { actor } = command;
  const patch = {
    ...data, revision, updated_at: now,
    history_entries: { create: [{
      revision, revision_key: current ? current.id + ":" + revision : "create:" + command.key,
      command_key: command.key, request_hash: command.hash, action, actor_user_id: actor.actorId,
      actor_name: actor.actorName, actor_role: actor.actorRole, occurred_at: now,
      before_values: before, after_values: after,
    }] },
  };
  let id = current?.id;
  try {
    const { data: saved } = z.object({ data: z.object({ id: positiveId }) }).parse(
      await writeGovernmentLoansItem(GOVERNMENT_LOAN_REQUESTS, patch, "id", id),
    );
    id = saved.id;
  } catch (error) {
    const replay = await replayCommand(command).catch(cause => {
      if (cause instanceof LoanRequestError) throw cause;
      return null;
    });
    if (replay) return replay;
    if (error instanceof GovernmentLoansDirectusError && error.code === "RECORD_NOT_UNIQUE") {
      throw current && current.status !== "DRAFT" ? staleRequest() : staleDraft();
    }
    throw error;
  }
  return getLoanRequest(id);
}

function draftValues(form: RequestForm, assessment: RequestAssessment) {
  return {
    form, employee_user_id: form.employeeId, employee_name: assessment.employee?.name ?? null,
    agency_id: assessment.agency?.id ?? null, agency_name: assessment.agency?.name ?? null,
    missing_fields: assessment.fieldErrors,
  };
}

export async function saveLoanRequest(body: unknown, key: string | null, actor: AgencyActor, id?: number) {
  const input = id === undefined
    ? { ...parseInput(addRequestInput, body), expectedRevision: null }
    : parseInput(updateRequestInput, body);
  const command = loanCommand(key, { action: "save", ...input }, actor, id);
  const replay = await replayCommand(command);
  if (replay) return replay;
  const current = id === undefined ? null : await readRequest(id);
  if (current) assertDraft(current, input.expectedRevision!);
  const invalid = invalidDraftFields(input.form);
  if (Object.keys(invalid).length) throw new LoanRequestError(422, "Check the request fields.", invalid);
  const assessment = await assessRequest(input.form);
  const values = draftValues(input.form, assessment);
  const now = new Date().toISOString();
  return writeRequestRevision(command, current ? "DRAFT_SAVED" : "DRAFT_CREATED", current, {
    ...values, status: "DRAFT", ...(current ? {} : { created_by_user_id: actor.actorId, created_at: now }),
  }, current ? { form: current.form } : null, { form: input.form }, now);
}

export async function submitLoanRequest(id: number, body: unknown, key: string | null, actor: AgencyActor) {
  const input = parseInput(submitRequestInput, body);
  const command = loanCommand(key, { action: "submit", ...input }, actor, id);
  const replay = await replayCommand(command);
  if (replay) return replay;
  const current = await readRequest(id);
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
  }, { status: current.status }, { status: "REQUESTED", consent, ...filed }, now);
}

export async function cancelLoanRequest(id: number, body: unknown, key: string | null, actor: AgencyActor) {
  const { expectedRevision, reason: suppliedReason } = parseInput(cancelRequestInput, body);
  const reason = suppliedReason || null;
  const command = loanCommand(key, { action: "cancel", expectedRevision, reason }, actor, id);
  const replay = await replayCommand(command);
  if (replay) return replay;

  const current = await readRequest(id);
  if (current.revision !== expectedRevision) throw staleRequest();
  if (!canCancelRequest(current.status)) {
    throw new LoanRequestError(409, "Only requested or approved loans can be cancelled before enrollment.");
  }
  return writeRequestRevision(command, "REQUEST_CANCELLED", current, { status: "CANCELLED" },
    { status: current.status }, { status: "CANCELLED", reason });
}
