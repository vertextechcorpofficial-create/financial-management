import "server-only";

import { z } from "zod";
import { REQUEST_SLA_DAYS, allApprovalChecksPass, requestWaitingDays } from "../approval/rules";
import {
  APPROVAL_PAGE_SIZE, approvalSorts, companyDecisions, type ApprovalAssessment, type ApprovalDecisionPage,
  type ApprovalOutcome, type ApprovalQueuePage, type ApprovalQueueSummary, type ApprovalReview,
  type ApprovalSelection, type ApprovalSort, type BulkApprovalResult, type CompanyDecision,
} from "../approval/types";
import type { RequestForm } from "../requests/types";
import { listAgencies, type AgencyActor } from "./agencies";
import { GOVERNMENT_LOAN_REQUEST_HISTORY, GOVERNMENT_LOAN_REQUESTS, readGovernmentLoansItems, type GovernmentLoansCollection } from "./directus";
import {
  assertFiledRequest, commitRequestRevision, isoDateTime, loanCommand, loanCommandPartKey, readCommandReceipt, readRequest,
  recordLoanBatchEvent, referenceFor, requestDetails, requestRow,
} from "./loan-requests";
import { assessRequest } from "./request-assessment";
import { LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";

const filedChecks = z.object({ checks: z.array(z.object({
  label: z.string(), result: z.enum(["pass", "review"]), detail: z.string(),
})) }).nullish();
const queueRow = requestRow.pick({ id: true, revision: true, employee_name: true, agency_name: true }).extend({
  form: z.object({ program: z.string(), amount: z.string() }), requested_at: z.string(), filed_assessment: filedChecks,
});
const queueInput = z.object({
  q: z.string().trim().max(120).default(""), agency: positiveId.optional(), overdue: z.enum(["1", "0"]).optional(),
  checks: z.enum(["ready", "review"]).optional(), page: pageNumber,
  sort: z.enum(Object.keys(approvalSorts) as [ApprovalSort, ...ApprovalSort[]]).default("filed"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  size: z.coerce.number().int().refine(value => [10, 25, 50].includes(value)).default(APPROVAL_PAGE_SIZE),
});
const countResult = z.object({ data: z.array(z.object({ count: z.object({ id: z.coerce.number().int().nonnegative() }) })).max(1) });

async function countRows(collection: GovernmentLoansCollection, filter: object) {
  const query = new URLSearchParams({ "aggregate[count]": "id", limit: "1", filter: JSON.stringify(filter) });
  const { data } = countResult.parse(await readGovernmentLoansItems(collection, query));
  return data[0]?.count.id ?? 0;
}

type ApprovalQueueRow = z.output<typeof queueRow>;

async function readAllApprovalRows(filter: object) {
  const rows: ApprovalQueueRow[] = [];
  for (let offset = 0; ; offset += 50) {
    const query = new URLSearchParams({ fields: Object.keys(queueRow.shape).join(","), filter: JSON.stringify(filter),
      sort: "id", limit: "50", offset: String(offset) });
    const { data } = z.object({ data: z.array(queueRow).max(50) })
      .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUESTS, query));
    rows.push(...data);
    if (data.length < 50) return rows;
  }
}

function queueItem(row: ApprovalQueueRow, now: Date) {
  const requestedAt = isoDateTime(row.requested_at);
  return {
    id: row.id, reference: referenceFor(row.id), revision: row.revision, employeeName: row.employee_name,
    agencyName: row.agency_name, program: row.form.program, amount: row.form.amount, requestedAt, filedBy: null,
    waitingDays: requestWaitingDays(requestedAt, now), filedChecksPass: allApprovalChecksPass(row.filed_assessment?.checks),
    checks: row.filed_assessment?.checks ?? [],
  };
}

const filedByRow = z.object({
  request_id: z.union([positiveId, z.object({ id: positiveId })]).transform(value => typeof value === "number" ? value : value.id),
  actor_name: z.string(), occurred_at: z.string(),
});

async function readFiledBy(ids: number[]) {
  if (!ids.length) return new Map<number, string>();
  const query = new URLSearchParams({ fields: "request_id,actor_name,occurred_at",
    filter: JSON.stringify({ action: { _eq: "REQUEST_SUBMITTED" }, request_id: { _in: ids } }),
    sort: "-occurred_at,-id", limit: String(Math.min(ids.length * 5, 250)) });
  const { data } = z.object({ data: z.array(filedByRow) })
    .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUEST_HISTORY, query));
  const filedBy = new Map<number, string>();
  for (const row of data) if (!filedBy.has(row.request_id)) filedBy.set(row.request_id, row.actor_name);
  return filedBy;
}

function summarizeQueue(items: ReturnType<typeof queueItem>[]): ApprovalQueueSummary {
  let overdue = 0;
  let oldestWaitingDays = 0;
  let ready = 0;
  for (const item of items) {
    if (item.waitingDays > REQUEST_SLA_DAYS) overdue++;
    if (item.waitingDays > oldestWaitingDays) oldestWaitingDays = item.waitingDays;
    if (item.filedChecksPass) ready++;
  }
  return { waiting: items.length, overdue, oldestWaitingDays, ready, review: items.length - ready };
}

function queueSortValue(item: ReturnType<typeof queueItem>, key: ApprovalSort): string | number | null {
  switch (key) {
    case "reference": return item.id;
    case "employee": return item.employeeName;
    case "agency": return item.agencyName;
    case "program": return item.program;
    case "amount": return Math.round(Number(item.amount) * 100);
    case "filed": return item.requestedAt;
    case "waiting": return item.waitingDays;
    case "checks": return item.filedChecksPass ? 0 : item.checks.filter(check => check.result === "review").length;
  }
}

function sortQueue(items: ReturnType<typeof queueItem>[], key: ApprovalSort, direction: "asc" | "desc") {
  items.sort((left, right) => {
    const a = queueSortValue(left, key);
    const b = queueSortValue(right, key);
    if (a === null || b === null) return a === b ? right.id - left.id : a === null ? 1 : -1;
    const order = typeof a === "number" && typeof b === "number" ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true });
    return (direction === "asc" ? order : -order) || right.id - left.id;
  });
}

export async function listApprovalQueue(params: URLSearchParams, now = new Date()): Promise<ApprovalQueuePage> {
  const { q, agency, overdue, checks, page, sort, direction, size } = parseInput(queueInput, Object.fromEntries(params));
  const referenceId = /^(?:GLR-)?0*([1-9]\d{0,9})$/i.exec(q)?.[1];
  const search = q ? { _or: [{ employee_name: { _icontains: q } }, ...(referenceId ? [{ id: { _eq: Number(referenceId) } }] : [])] } : {};
  const base = { ...(agency ? { agency_id: { _eq: agency } } : {}), ...search };
  const allItems = (await readAllApprovalRows({ ...base, status: { _eq: "REQUESTED" }, requested_at: { _nnull: true } }))
    .map(row => queueItem(row, now));
  const summary = summarizeQueue(allItems);
  const filtered = allItems.filter(item =>
    (overdue !== "1" || item.waitingDays > REQUEST_SLA_DAYS) &&
    (!checks || (checks === "ready" ? item.filedChecksPass : !item.filedChecksPass)));
  sortQueue(filtered, sort, direction);
  const start = (page - 1) * size;
  const items = filtered.slice(start, start + size);
  const filedBy = await readFiledBy(items.map(item => item.id)).catch(() => new Map<number, string>());
  return {
    items: items.map(item => ({ ...item, filedBy: filedBy.get(item.id) ?? null })),
    total: filtered.length, pageSize: size, hasMore: filtered.length > start + size, summary,
  };
}

export async function listApprovalAgencies(params: URLSearchParams) {
  const { agencies, hasMore } = await listAgencies(new URLSearchParams({ page: params.get("page") ?? "1" }));
  return { items: agencies.map(agency => ({ id: agency.id, name: agency.fullName })), hasMore };
}

const decisionValues = z.object({
  status: z.enum(["APPROVED", "REJECTED"]), remarks: z.string().nullish(), reason: z.string().nullish(),
});
const decisionRequestRow = z.object({ id: positiveId, employee_name: z.string().nullable(), agency_name: z.string().nullable() });
const recentDecision = z.object({
  id: positiveId, actor_name: z.string(), occurred_at: z.string(), after_values: decisionValues,
  request_id: z.union([positiveId, z.object({ id: positiveId })]).transform(value => typeof value === "number" ? value : value.id),
});
const decisionListInput = z.object({
  page: pageNumber,
  size: z.coerce.number().int().refine(value => [10, 25, 50].includes(value)).default(APPROVAL_PAGE_SIZE),
});

export async function listApprovalDecisions(params: URLSearchParams): Promise<ApprovalDecisionPage> {
  const { page, size } = parseInput(decisionListInput, Object.fromEntries(params));
  const filter = { action: { _in: ["REQUEST_APPROVED", "REQUEST_REJECTED"] } };
  const query = new URLSearchParams({
    fields: "id,actor_name,occurred_at,after_values,request_id",
    filter: JSON.stringify(filter),
    sort: "-occurred_at,-id", limit: String(size + 1), offset: String((page - 1) * size),
  });
  const [{ data }, total] = await Promise.all([
    readGovernmentLoansItems(GOVERNMENT_LOAN_REQUEST_HISTORY, query)
      .then(body => z.object({ data: z.array(recentDecision).max(size + 1) }).parse(body)),
    countRows(GOVERNMENT_LOAN_REQUEST_HISTORY, filter),
  ]);
  const rows = data.slice(0, size);
  const ids = [...new Set(rows.map(event => event.request_id))];
  const requests = new Map<number, z.output<typeof decisionRequestRow>>();
  if (ids.length) {
    const requestQuery = new URLSearchParams({ fields: "id,employee_name,agency_name",
      filter: JSON.stringify({ id: { _in: ids } }), limit: String(Math.min(ids.length, 50)) });
    const parsed = z.object({ data: z.array(decisionRequestRow) })
      .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUESTS, requestQuery));
    for (const request of parsed.data) requests.set(request.id, request);
  }
  return {
    items: rows.map(event => ({
      id: event.id, requestId: event.request_id, reference: referenceFor(event.request_id),
      employeeName: requests.get(event.request_id)?.employee_name ?? null,
      agencyName: requests.get(event.request_id)?.agency_name ?? null,
      decision: event.after_values.status, actorName: event.actor_name, occurredAt: isoDateTime(event.occurred_at),
      remarks: event.after_values.reason ?? event.after_values.remarks ?? null,
    })),
    total, pageSize: size, hasMore: data.length > size,
  };
}

async function currentAssessment(form: RequestForm): Promise<ApprovalAssessment> {
  const assessed = await assessRequest(form).catch(() => null);
  if (!assessed) return {
    capacity: null, checks: [{ label: "Current checks", result: "review", detail: "Employee or Payroll data could not be checked. Reload the request to try again." }],
  };
  const issues = Object.values(assessed.fieldErrors);
  return {
    capacity: assessed.capacity,
    checks: issues.length ? [...assessed.checks, { label: "Current request details", result: "review", detail: issues.join(" ") }] : assessed.checks,
  };
}

export async function getApprovalReview(id: number): Promise<ApprovalReview> {
  const row = assertFiledRequest(await readRequest(id));
  const [request, current] = await Promise.all([
    requestDetails(row), row.status === "REQUESTED" ? currentAssessment(row.form) : null,
  ]);
  return { request, currentAssessment: current };
}

const remarksInput = z.string().trim().max(500).default("");
const decisionInput = z.strictObject({
  action: z.enum(companyDecisions), expectedRevision: z.number().int().positive(), remarks: remarksInput,
});
type Command = ReturnType<typeof loanCommand>;
type StoredRequest = Awaited<ReturnType<typeof readRequest>>;
type Receipt = Awaited<ReturnType<typeof commitRequestRevision>>;

function commitDecision(row: StoredRequest, command: Command, action: CompanyDecision, remarks: string, batchKey?: string) {
  const status = action === "APPROVE" ? "APPROVED" : "REJECTED";
  return commitRequestRevision(command, action === "APPROVE" ? "REQUEST_APPROVED" : "REQUEST_REJECTED", row, { status },
    { status: row.status }, {
      status, ...(action === "REJECT" ? { reason: remarks } : { remarks: remarks || null }), ...(batchKey ? { batchKey } : {}),
    });
}

function recordedDecision(receipt: { request_id: number; after_values: unknown }) {
  return { id: receipt.request_id, reference: referenceFor(receipt.request_id), decision: decisionValues.parse(receipt.after_values).status };
}

export async function decideLoanApproval(id: number, body: unknown, key: string | null, actor: AgencyActor) {
  const input = parseInput(decisionInput, body);
  if (input.action === "REJECT" && !input.remarks) {
    throw new LoanRequestError(422, "Enter a reason for rejecting the request.", { remarks: "Enter a rejection reason." });
  }
  const command = loanCommand(key, { operation: "decide", ...input }, actor, id);
  const existing = await readCommandReceipt(command);
  if (existing) return recordedDecision(existing);
  const row = assertFiledRequest(await readRequest(id));
  if (row.status !== "REQUESTED" || row.revision !== input.expectedRevision) {
    throw new LoanRequestError(409, "This request changed. Reload it to see its current status.");
  }
  return recordedDecision(await commitDecision(row, command, input.action, input.remarks));
}

const bulkInput = z.strictObject({
  items: z.array(z.strictObject({ id: positiveId, expectedRevision: z.number().int().positive() }))
    .min(1).max(APPROVAL_PAGE_SIZE).refine(items => new Set(items.map(row => row.id)).size === items.length),
  remarks: remarksInput,
});
const outcomeRow = z.object({ id: positiveId, reference: z.string(), outcome: z.enum(["approved", "skipped"]), reason: z.string().nullable() });
const batchResult = z.object({ approved: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), items: z.array(outcomeRow) });

function skipOutcome(id: number, reason: string): ApprovalOutcome {
  return { id, reference: referenceFor(id), outcome: "skipped", reason };
}

async function evaluateBulkItem(batch: Command, item: ApprovalSelection, remarks: string): Promise<Receipt | null> {
  const command = loanCommand(loanCommandPartKey(batch.key, item.id), { operation: "bulk-approve-item", batch: batch.hash, ...item }, batch.actor, item.id);
  const existing = await readCommandReceipt(command);
  if (existing) return existing;
  const row = await readRequest(item.id).catch(error => {
    if (error instanceof LoanRequestError && error.status === 404) return null;
    throw error;
  });
  if (!row || row.status === "DRAFT" || !row.requested_at) return null;
  const skip = (reason: string) => recordLoanBatchEvent(command, "BULK_APPROVAL_SKIPPED", row, skipOutcome(item.id, reason));
  if (row.status !== "REQUESTED") return skip("The request is no longer awaiting approval.");
  if (row.revision !== item.expectedRevision) return skip("The request changed. Reload it before approving.");
  const { checks } = await currentAssessment(row.form);
  if (!allApprovalChecksPass(checks)) {
    const reasons = checks.filter(check => check.result === "review").map(check => check.detail);
    return skip(reasons.join(" ") || "Current eligibility checks are incomplete.");
  }
  try {
    return await commitDecision(row, command, "APPROVE", remarks, batch.key);
  } catch (error) {
    if (error instanceof LoanRequestError && error.status === 409) {
      return skip("Another action changed the request. Reload it to see the current status.");
    }
    throw error;
  }
}

async function startApprovalBatch(command: Command, items: ApprovalSelection[]) {
  const existing = await readCommandReceipt(command);
  if (existing) return existing;
  const ids = items.map(item => item.id);
  const query = new URLSearchParams({ fields: "id,revision", limit: "1", sort: "id", filter: JSON.stringify({
    id: { _in: ids }, status: { _neq: "DRAFT" }, requested_at: { _nnull: true },
  }) });
  const { data: [request] } = z.object({ data: z.array(requestRow.pick({ id: true, revision: true })).max(1) })
    .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUESTS, query));
  return request ? recordLoanBatchEvent(command, "BULK_APPROVAL_STARTED", request, { requestIds: ids }) : null;
}

export async function bulkApproveLoanRequests(body: unknown, key: string | null, actor: AgencyActor): Promise<BulkApprovalResult> {
  const { items, remarks } = parseInput(bulkInput, body);
  const batch = loanCommand(key, { operation: "bulk-approve", items, remarks }, actor);
  const started = await startApprovalBatch(batch, items);
  if (!started) return { approved: 0, skipped: items.length, items: items.map(item => skipOutcome(item.id, "The filed request could not be found.")) };
  // The earlier writer saved completed results under the original batch key.
  if (started.action === "BULK_APPROVAL_COMPLETED") return batchResult.parse(started.after_values);

  const completion = loanCommand(loanCommandPartKey(batch.key, "result"), { operation: "bulk-approve-result", batch: batch.hash }, actor);
  const existing = await readCommandReceipt(completion);
  if (existing) return batchResult.parse(existing.after_values);

  const outcomes: ApprovalOutcome[] = [];
  for (const item of items) {
    const receipt = await evaluateBulkItem(batch, item, remarks);
    if (!receipt) {
      outcomes.push(skipOutcome(item.id, "The filed request could not be found."));
      continue;
    }
    outcomes.push(receipt.action === "REQUEST_APPROVED"
      ? { id: item.id, reference: referenceFor(item.id), outcome: "approved", reason: null }
      : outcomeRow.parse(receipt.after_values));
  }
  const approved = outcomes.filter(item => item.outcome === "approved").length;
  const result = { approved, skipped: outcomes.length - approved, items: outcomes };
  const summary = await recordLoanBatchEvent(completion, "BULK_APPROVAL_COMPLETED",
    { id: started.request_id, revision: started.revision }, result);
  return batchResult.parse(summary.after_values);
}
