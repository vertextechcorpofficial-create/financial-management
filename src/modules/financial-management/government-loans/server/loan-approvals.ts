import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { allApprovalChecksPass, overdueRequestCutoff, requestWaitingDays } from "../approval/rules";
import {
  APPROVAL_PAGE_SIZE, companyDecisions, type ApprovalAssessment, type ApprovalDecisionRow, type ApprovalOutcome,
  type ApprovalQueueItem, type ApprovalReview, type ApprovalSelection, type BulkApprovalResult, type CompanyDecision,
} from "../approval/types";
import type { Page, RequestForm } from "../requests/types";
import { listAgencies, type AgencyActor } from "./agencies";
import { GOVERNMENT_LOAN_REQUEST_HISTORY, GOVERNMENT_LOAN_REQUESTS, readGovernmentLoansItems } from "./directus";
import {
  assertFiledRequest, commitRequestRevision, isoDateTime, loanCommand, readCommandReceipt, readRequest,
  recordBulkApprovalEvent, referenceFor, requestDetails, requestRow,
} from "./loan-requests";
import { assessRequest } from "./request-assessment";
import { LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";

const filedChecks = z.object({ checks: z.array(z.object({ result: z.enum(["pass", "review"]) })) }).nullish();
const queueRow = requestRow.pick({ id: true, revision: true, employee_name: true, agency_name: true }).extend({
  form: z.object({ program: z.string(), amount: z.string() }), requested_at: z.string(), filed_assessment: filedChecks,
});
const queueInput = z.object({
  q: z.string().trim().max(120).default(""), agency: positiveId.optional(), overdue: z.enum(["1", "0"]).optional(), page: pageNumber,
});

export async function listApprovalQueue(params: URLSearchParams, now = new Date()): Promise<Page<ApprovalQueueItem>> {
  const { q, agency, overdue, page } = parseInput(queueInput, Object.fromEntries(params));
  const referenceId = /^(?:GLR-)?0*([1-9]\d{0,9})$/i.exec(q)?.[1];
  const filter = {
    status: { _eq: "REQUESTED" },
    requested_at: { _nnull: true, ...(overdue === "1" ? { _lt: overdueRequestCutoff(now) } : {}) },
    ...(agency ? { agency_id: { _eq: agency } } : {}),
    ...(q ? { _or: [{ employee_name: { _icontains: q } }, ...(referenceId ? [{ id: { _eq: Number(referenceId) } }] : [])] } : {}),
  };
  const query = new URLSearchParams({
    fields: Object.keys(queueRow.shape).join(","), filter: JSON.stringify(filter), sort: "requested_at,id",
    limit: String(APPROVAL_PAGE_SIZE + 1), offset: String((page - 1) * APPROVAL_PAGE_SIZE),
  });
  const { data } = z.object({ data: z.array(queueRow).max(APPROVAL_PAGE_SIZE + 1) })
    .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUESTS, query));
  const items = data.slice(0, APPROVAL_PAGE_SIZE).map(row => {
    const requestedAt = isoDateTime(row.requested_at);
    return {
      id: row.id, reference: referenceFor(row.id), revision: row.revision, employeeName: row.employee_name,
      agencyName: row.agency_name, program: row.form.program, amount: row.form.amount, requestedAt,
      waitingDays: requestWaitingDays(requestedAt, now), filedChecksPass: allApprovalChecksPass(row.filed_assessment?.checks),
    };
  });
  return { items, hasMore: data.length > APPROVAL_PAGE_SIZE };
}

export async function listApprovalAgencies(params: URLSearchParams) {
  const { agencies, hasMore } = await listAgencies(new URLSearchParams({ page: params.get("page") ?? "1" }));
  return { items: agencies.map(agency => ({ id: agency.id, name: agency.fullName })), hasMore };
}

const decisionValues = z.object({
  status: z.enum(["APPROVED", "REJECTED"]), remarks: z.string().nullish(), reason: z.string().nullish(),
});
const recentDecision = z.object({
  id: positiveId, actor_name: z.string(), occurred_at: z.string(), after_values: decisionValues,
  request_id: z.object({ id: positiveId, employee_name: z.string().nullable(), agency_name: z.string().nullable() }),
});

export async function listApprovalDecisions(params: URLSearchParams): Promise<Page<ApprovalDecisionRow>> {
  const page = parseInput(pageNumber, params.get("page") ?? undefined);
  const query = new URLSearchParams({
    fields: "id,actor_name,occurred_at,after_values,request_id.id,request_id.employee_name,request_id.agency_name",
    filter: JSON.stringify({ action: { _in: ["REQUEST_APPROVED", "REQUEST_REJECTED"] }, request_id: { requested_at: { _nnull: true } } }),
    sort: "-occurred_at,-id", limit: String(APPROVAL_PAGE_SIZE + 1), offset: String((page - 1) * APPROVAL_PAGE_SIZE),
  });
  const { data } = z.object({ data: z.array(recentDecision).max(APPROVAL_PAGE_SIZE + 1) })
    .parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REQUEST_HISTORY, query));
  return {
    items: data.slice(0, APPROVAL_PAGE_SIZE).map(event => ({
      id: event.id, requestId: event.request_id.id, reference: referenceFor(event.request_id.id),
      employeeName: event.request_id.employee_name, agencyName: event.request_id.agency_name,
      decision: event.after_values.status, actorName: event.actor_name, occurredAt: isoDateTime(event.occurred_at),
      remarks: event.after_values.reason ?? event.after_values.remarks ?? null,
    })),
    hasMore: data.length > APPROVAL_PAGE_SIZE,
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

function bulkReceiptKey(batchKey: string, part: number | "result") {
  const hash = createHash("sha256").update(`${batchKey}:${part}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function skipOutcome(id: number, reason: string): ApprovalOutcome {
  return { id, reference: referenceFor(id), outcome: "skipped", reason };
}

async function evaluateBulkItem(batch: Command, item: ApprovalSelection, remarks: string): Promise<Receipt | null> {
  const command = loanCommand(bulkReceiptKey(batch.key, item.id), { operation: "bulk-approve-item", batch: batch.hash, ...item }, batch.actor, item.id);
  const existing = await readCommandReceipt(command);
  if (existing) return existing;
  const row = await readRequest(item.id).catch(error => {
    if (error instanceof LoanRequestError && error.status === 404) return null;
    throw error;
  });
  if (!row || row.status === "DRAFT" || !row.requested_at) return null;
  const skip = (reason: string) => recordBulkApprovalEvent(command, "BULK_APPROVAL_SKIPPED", row, skipOutcome(item.id, reason));
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
  return request ? recordBulkApprovalEvent(command, "BULK_APPROVAL_STARTED", request, { requestIds: ids }) : null;
}

export async function bulkApproveLoanRequests(body: unknown, key: string | null, actor: AgencyActor): Promise<BulkApprovalResult> {
  const { items, remarks } = parseInput(bulkInput, body);
  const batch = loanCommand(key, { operation: "bulk-approve", items, remarks }, actor);
  const started = await startApprovalBatch(batch, items);
  if (!started) return { approved: 0, skipped: items.length, items: items.map(item => skipOutcome(item.id, "The filed request could not be found.")) };
  // The earlier writer saved completed results under the original batch key.
  if (started.action === "BULK_APPROVAL_COMPLETED") return batchResult.parse(started.after_values);

  const completion = loanCommand(bulkReceiptKey(batch.key, "result"), { operation: "bulk-approve-result", batch: batch.hash }, actor);
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
  const summary = await recordBulkApprovalEvent(completion, "BULK_APPROVAL_COMPLETED",
    { id: started.request_id, revision: started.revision }, result);
  return batchResult.parse(summary.after_values);
}
