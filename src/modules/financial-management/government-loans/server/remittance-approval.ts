import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { REQUEST_SLA_DAYS, requestWaitingDays } from "../approval/rules";
import { remittanceLiability } from "../remittances/approval/rules";
import {
  remittanceApprovalSorts, type RemittanceApprovalSort, type RemittanceApprovalSummary,
} from "../remittances/approval/types";
import { remitKey, remittancePenalty } from "../remittances/preparation/rules";
import { amountFromCentavos } from "../loans/position";
import { centavos } from "../payroll-handoff/contract";
import { getAgencyBillingSummary } from "./agency-billing";
import { readAgency, type AgencyActor } from "./agencies";
import { mapLimit } from "./concurrency";
import { GOVERNMENT_LOAN_AGENCIES, GOVERNMENT_LOAN_PAYROLL_RESULTS, GOVERNMENT_LOAN_REMITTANCES, GOVERNMENT_LOAN_REMITTANCE_DECISIONS, GovernmentLoansDirectusError,
  governmentLoansDirectus, readGovernmentLoansItems, writeGovernmentLoansItem } from "./directus";
import { readEnrollmentRows } from "./enrollment-sources";
import { readOpenMonth } from "./loan-enrollment";
import { isoDateTime, loanCommandPartKey } from "./loan-requests";
import { payrollMoney, readCurrentPayrollReceipt, readPayrollPages } from "./payroll-month-store";
import { nextPeriodCommand } from "./period-commands";
import { approvalQueueRow, readRemittanceOverview, readSavedBatch, readSavedRemittance, remittanceBatchSummary } from "./remittance-records";
import { downloadLoanDocument, privateRequestFolder } from "./request-documents";
import { LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";

const pageSize = 25;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const checkSchema = z.object({ label: z.string(), status: z.enum(["pass", "warning", "block", "na"]), detail: z.string() });
const outcome = z.object({ id: z.uuid(), approved: z.boolean(), reason: z.string().nullable() });
const batchResult = z.object({ items: z.array(outcome) });
const decisionRow = z.object({
  id: z.uuid(), command_key: z.uuid(), request_hash: z.string(), action: z.enum(["APPROVE", "RETURN", "BULK_START", "BULK_COMPLETE"]),
  actor_name: z.string(), decided_at: z.string(), reason: z.string().nullable(), evidence: z.unknown(),
});
const decisionFields = Object.keys(decisionRow.shape).join(",");
type Decision = z.output<typeof decisionRow>;
type Check = z.output<typeof checkSchema>;
const summary = z.object({ id: z.uuid(), agency: z.string(), month: z.string(), reference: z.string(),
  amount: z.string(), penalty: z.string(), paymentDate: z.string() });
const reviewEvidence = z.object({ checks: z.array(checkSchema), latestReceipt: z.object({ id: z.uuid(), revision: positiveId }).nullable(),
  billingRevision: z.object({ id: z.uuid(), number: positiveId }).nullable(), billingDifferences: z.number(),
  billingAmounts: z.object({ billed: z.string().nullable(), deduction: z.string().nullable(), difference: z.string().nullable() }).nullable(),
  confirmedWithheld: z.string().nullable(), observedOpenMonth: z.string().nullable(),
  agencyName: z.string(), employerNumber: z.string().nullable(), referenceLabel: z.string() });
const savedEvidence = z.object({ payment: summary, review: reviewEvidence });
const queueQuery = z.object({
  q: z.string().trim().max(120).default(""), agencyId: positiveId.optional(), overdue: z.enum(["1"]).optional(),
  page: pageNumber,
  sort: z.enum(Object.keys(remittanceApprovalSorts) as [RemittanceApprovalSort, ...RemittanceApprovalSort[]]).default("waiting"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  size: z.coerce.number().int().refine(value => [10, 25, 50].includes(value)).default(pageSize),
  historyPage: pageNumber,
  historySize: z.coerce.number().int().refine(value => [10, 25, 50].includes(value)).default(pageSize),
});
const pendingFields = "id,agency_id,agency_name,agency_code,payroll_month,withheld,entered_penalty,payment_reference,payment_date,submitted_at,batch_id.uploaded_by,batch_id.proof_name";
const countResult = z.object({ data: z.array(z.object({ count: z.object({ id: z.coerce.number().int().nonnegative() }) })).max(1) });

type PendingRow = z.output<typeof approvalQueueRow>;

async function readAllPending(filter: object) {
  const rows: PendingRow[] = [];
  for (let offset = 0; ; offset += 50) {
    const page = await readEnrollmentRows(GOVERNMENT_LOAN_REMITTANCES, approvalQueueRow, pendingFields,
      filter, 50, "submitted_at,id", offset);
    rows.push(...page);
    if (page.length < 50) return rows;
  }
}

function pendingItem(row: PendingRow, now: Date) {
  const submittedAt = isoDateTime(row.submitted_at);
  return {
    id: row.id, agencyId: row.agency_id, agency: row.agency_name, agencyCode: row.agency_code,
    month: row.payroll_month, amount: row.withheld, penalty: row.entered_penalty,
    reference: row.payment_reference, paymentDate: row.payment_date, submittedAt,
    preparedBy: row.batch_id.uploaded_by, proofName: row.batch_id.proof_name,
    waitingDays: requestWaitingDays(submittedAt, now),
  };
}

function summarizePending(items: ReturnType<typeof pendingItem>[]): RemittanceApprovalSummary {
  let overdue = 0;
  let oldestWaitingDays = 0;
  let amount = 0n;
  let penalty = 0n;
  for (const item of items) {
    if (item.waitingDays > REQUEST_SLA_DAYS) overdue++;
    if (item.waitingDays > oldestWaitingDays) oldestWaitingDays = item.waitingDays;
    amount += centavos(item.amount);
    penalty += centavos(item.penalty);
  }
  return { pending: items.length, overdue, oldestWaitingDays,
    amount: amountFromCentavos(amount), penalty: amountFromCentavos(penalty) };
}

function pendingSortValue(item: ReturnType<typeof pendingItem>, key: RemittanceApprovalSort): string | number {
  switch (key) {
    case "agency": return item.agency;
    case "month": return item.month;
    case "amount": return Number(centavos(item.amount));
    case "penalty": return Number(centavos(item.penalty));
    case "paymentDate": return item.paymentDate;
    case "reference": return item.reference;
    case "preparedBy": return item.preparedBy;
    case "waiting": return item.waitingDays;
  }
}

function sortPending(items: ReturnType<typeof pendingItem>[], key: RemittanceApprovalSort, direction: "asc" | "desc") {
  items.sort((left, right) => {
    const a = pendingSortValue(left, key);
    const b = pendingSortValue(right, key);
    const order = typeof a === "number" && typeof b === "number" ? a - b
      : String(a).localeCompare(String(b), undefined, { numeric: true });
    return (direction === "asc" ? order : -order) || left.id.localeCompare(right.id);
  });
}

async function countDecisions(filter: object) {
  const query = new URLSearchParams({ "aggregate[count]": "id", limit: "1", filter: JSON.stringify(filter) });
  const { data } = countResult.parse(await readGovernmentLoansItems(GOVERNMENT_LOAN_REMITTANCE_DECISIONS, query));
  return data[0]?.count.id ?? 0;
}

export async function listRemittanceApproval(params: URLSearchParams) {
  const { q, agencyId, overdue, page, sort, direction, size, historyPage, historySize } =
    parseInput(queueQuery, Object.fromEntries(params));
  const today = todayManila();
  const now = new Date(today + "T00:00:00+08:00");
  const baseFilter = { state: { _eq: "PENDING" }, ...(agencyId ? { agency_id: { _eq: agencyId } } : {}),
    ...(q ? { _or: [{ payment_reference: { _icontains: q } }, { agency_name: { _icontains: q } },
      { batch_id: { uploaded_by: { _icontains: q } } }] } : {}) };
  const allPending = (await readAllPending(baseFilter)).map(row => pendingItem(row, now));
  const summary = summarizePending(allPending);
  const filtered = allPending.filter(item => overdue !== "1" || item.waitingDays > REQUEST_SLA_DAYS);
  sortPending(filtered, sort, direction);
  const start = (page - 1) * size;
  const historyFilter = { action: { _in: ["APPROVE", "RETURN"] } };
  const [history, totalHistory] = await Promise.all([
    readEnrollmentRows(GOVERNMENT_LOAN_REMITTANCE_DECISIONS, decisionRow, decisionFields,
      historyFilter, historySize, "-decided_at,-id", (historyPage - 1) * historySize),
    countDecisions(historyFilter),
  ]);
  return { today, summary, total: filtered.length, pageSize: size, hasMore: filtered.length > start + size,
    pending: filtered.slice(start, start + size),
    history: history.map(row => ({ ...savedEvidence.parse(row.evidence).payment, ...decisionSummary(row) })),
    totalHistory, pageSizeHistory: historySize, hasMoreHistory: totalHistory > historyPage * historySize };
}

export function listApprovalAgencies() {
  return readPayrollPages(GOVERNMENT_LOAN_AGENCIES, z.object({ id: positiveId, display_name: z.string() }),
    "id,display_name", {}, "display_name,id");
}

function decisionSummary(row: Decision) {
  return { decisionId: row.id, action: row.action, actor: row.actor_name, at: isoDateTime(row.decided_at), reason: row.reason };
}

async function readDecision(filter: object) {
  const [row] = await readEnrollmentRows(GOVERNMENT_LOAN_REMITTANCE_DECISIONS, decisionRow, decisionFields, filter, 1);
  return row ?? null;
}

async function savedSource(id: string) {
  const payment = await readSavedRemittance(id);
  const batch = await readSavedBatch({ id: { _eq: payment.batch_id } });
  if (!batch) throw new LoanRequestError(503, "The prepared payment details are unavailable.");
  return { payment, batch };
}

async function proofPresent(id: string, size: number) {
  const folder = await privateRequestFolder();
  try {
    const response = await governmentLoansDirectus("/files/" + id + "?fields=id,folder,filesize");
    const { data } = z.object({ data: z.object({ id: z.uuid(), folder: z.uuid().nullable(), filesize: z.coerce.number() }) })
      .parse(await response.json());
    return data.id === id && data.folder === folder && data.filesize === size;
  } catch (error) {
    if (error instanceof GovernmentLoansDirectusError && [403, 404].includes(error.status)) return false;
    throw error;
  }
}

export async function downloadApprovalProof(id: string, inline: boolean) {
  const { batch } = await savedSource(id);
  if (!await proofPresent(batch.proof_file_id, batch.proof_size)) throw new LoanRequestError(404, "Payment proof is unavailable.");
  const proof = await downloadLoanDocument({ file_id: batch.proof_file_id, file_name: batch.proof_name,
    mime_type: batch.proof_type, size_bytes: batch.proof_size });
  if (inline) {
    const disposition = proof.headers.get("Content-Disposition");
    if (disposition) proof.headers.set("Content-Disposition", disposition.replace(/^attachment;/, "inline;"));
    proof.headers.set("Content-Security-Policy", "sandbox; default-src 'none'");
  }
  return proof;
}

async function currentReview(source: Awaited<ReturnType<typeof savedSource>>, openMonth: string | null) {
  const { payment, batch } = source;
  const [agency, receipt, proof] = await Promise.all([
    readAgency(payment.agency_id), readCurrentPayrollReceipt(payment.payroll_month),
    proofPresent(batch.proof_file_id, batch.proof_size),
  ]);
  const billing = agency.sendsBilling ? await getAgencyBillingSummary(agency.id, payment.payroll_month) : null;
  if (billing && billing.payrollReceipt?.id !== receipt?.id) {
    throw new LoanRequestError(409, "Payroll changed during review. Refresh the remittance.");
  }
  const amounts = receipt && !billing ? await readPayrollPages(GOVERNMENT_LOAN_PAYROLL_RESULTS,
    z.object({ amount: payrollMoney }), "amount", { receipt_id: { _eq: receipt.id }, agency_id: { _eq: payment.agency_id },
      status: { _in: ["D", "P", "X"] } }, "id") : [];
  const confirmedWithheld = billing ? billing.totals.deduction :
    receipt ? amountFromCentavos(amounts.reduce((total, row) => total + centavos(row.amount), 0n)) : null;
  const expectedPenalty = remittancePenalty(payment.withheld, payment.payment_date, payment.due_date, payment.policy_snapshot).computedPenalty;
  const billingDifferences = billing?.totals.discrepancies ?? 0;
  const inPeriod = openMonth !== null && payment.payment_date.slice(0, 7) >= openMonth;
  const checks: Check[] = [
    { label: "Payment equals confirmed withholding", status: confirmedWithheld === payment.withheld ? "pass" : "warning",
      detail: confirmedWithheld === null ? "Confirmed Payroll receipt unavailable" : "Paid " + payment.withheld + " · Withheld " + confirmedWithheld },
    { label: "Payment proof", status: proof ? "pass" : "warning", detail: proof ? batch.proof_name : "Proof unavailable" },
    { label: agency.paymentReferenceLabel, status: payment.payment_reference.trim() ? "pass" : "warning",
      detail: payment.payment_reference || "Missing reference" },
    { label: "Penalty matches agency rule", status: expectedPenalty === payment.entered_penalty ? "pass" : "warning",
      detail: "Entered " + payment.entered_penalty + " · Calculated " + expectedPenalty },
    { label: "Agency billing reconciled", status: !billing ? "na" : !billing.billingRevision || billingDifferences ? "warning" : "pass",
      detail: !billing ? "Agency does not send billing" : !billing.billingRevision ? "Expected agency bill is missing" :
        billingDifferences ? billingDifferences + " difference(s)" : "Matched" },
    { label: "Payment period", status: inPeriod ? "pass" : "block",
      detail: !openMonth ? "Open payment period is unavailable" : inPeriod ? payment.payment_date.slice(0, 7) + " is open" :
        payment.payment_date.slice(0, 7) + " is closed" },
  ];
  return { checks, confirmedWithheld, latestReceipt: receipt ? { id: receipt.id, revision: receipt.revision } : null,
    billingRevision: billing?.billingRevision ? { id: billing.billingRevision.id, number: billing.billingRevision.number } : null,
    billingDifferences, billingAmounts: billing ? { billed: billing.totals.billed, deduction: billing.totals.deduction,
      difference: billing.totals.difference } : null,
    observedOpenMonth: openMonth, agencyName: agency.fullName, employerNumber: agency.employerNumber,
    referenceLabel: agency.paymentReferenceLabel };
}

export async function reviewRemittanceApproval(id: string) {
  const source = await savedSource(id);
  const { payment, batch } = source;
  const decision = await readDecision({ remittance_id: { _eq: id } });
  const evidence = decision ? savedEvidence.parse(decision.evidence).review : await currentReview(source, await readOpenMonth());
  const state = decision?.action === "APPROVE" ? "APPROVED" : decision?.action === "RETURN" ? "RETURNED" : payment.state;
  const payments = decision ? [{ ...payment, state }] : await readRemittanceOverview({ agency_id: { _eq: payment.agency_id }, payroll_month: { _eq: payment.payroll_month },
    state: { _eq: "APPROVED" } });
  return { payment: { ...payment, state }, batch: remittanceBatchSummary(batch), evidence, token: hash([payment.id, state, evidence]),
    decision: decision ? decisionSummary(decision) : null, liability: remittanceLiability(evidence.confirmedWithheld, payments) };
}

const input = z.strictObject({
  action: z.enum(["APPROVE", "RETURN"]), token: z.string().regex(/^[a-f0-9]{64}$/),
  acknowledgeWarnings: z.boolean().default(false), reason: z.string().trim().max(500).default(""),
});
const bulkInput = z.strictObject({ ids: z.array(z.uuid()).min(1).max(pageSize)
  .refine(ids => new Set(ids).size === ids.length) });

function command(key: string, request: unknown, actor: AgencyActor) {
  return { key, actor, requestHash: hash([actor.actorId, request]) };
}
type Command = ReturnType<typeof command>;

async function replay(command: Command) {
  const row = await readDecision({ command_key: { _eq: command.key } });
  if (row && row.request_hash !== command.requestHash) throw new LoanRequestError(409, "This decision key was already used.");
  return row;
}

async function commit(command: Command, action: Decision["action"], evidence: unknown, fields: object = {}) {
  const decidedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const row = { id: randomUUID(), command_key: command.key, request_hash: command.requestHash, action,
    actor_id: command.actor.actorId, actor_name: command.actor.actorName, actor_role: command.actor.actorRole,
    decided_at: decidedAt, reason: null, evidence, ...fields };
  try {
    await writeGovernmentLoansItem(GOVERNMENT_LOAN_REMITTANCE_DECISIONS, row, "id", undefined, 30_000);
    return decisionRow.parse(row);
  } catch (error) {
    const existing = await replay(command);
    if (existing) return existing;
    if (error instanceof GovernmentLoansDirectusError && error.code === "RECORD_NOT_UNIQUE") {
      throw new LoanRequestError(409, "A decision or period change was recorded. Refresh the remittance before retrying.");
    }
    throw error;
  }
}

type DecisionContext = { openMonth: string; period: Awaited<ReturnType<typeof nextPeriodCommand>> };

async function decide(id: string, request: z.output<typeof input> | null, command: Command, context?: DecisionContext) {
  const existing = await replay(command);
  if (existing) return existing;
  try {
    const source = await savedSource(id);
    const { payment } = source;
    if (payment.state !== "PENDING" || payment.live_key !== remitKey(payment.agency_id, payment.payroll_month)) {
      throw new LoanRequestError(409, "This remittance is no longer awaiting approval.");
    }
    const action = request?.action ?? "APPROVE";
    if (action === "RETURN" && !request?.reason) throw new LoanRequestError(422, "Enter a reason for returning this remittance.",
      { reason: "Enter a return reason." });
    const observedOpenMonth = context?.openMonth ?? await readOpenMonth();
    if (!observedOpenMonth) throw new LoanRequestError(409, "The open payment period is unavailable.");
    const period = context?.period ?? await nextPeriodCommand(observedOpenMonth, observedOpenMonth);
    const review = await currentReview(source, observedOpenMonth);
    const blockers = review.checks.filter(check => check.status === "block");
    const warnings = review.checks.filter(check => check.status === "warning");
    if (request && request.token !== hash([payment.id, payment.state, review])) {
      throw new LoanRequestError(409, "Review evidence changed. Refresh the remittance before deciding.");
    }
    if (action === "APPROVE") {
      if (blockers.length) throw new LoanRequestError(409, blockers.map(check => check.detail).join(". "));
      if (warnings.length && (!request || !request.acknowledgeWarnings)) {
        throw new LoanRequestError(422, warnings.map(check => check.label + " · " + check.detail).join("; "));
      }
    }
    if (await readOpenMonth() !== observedOpenMonth) throw new LoanRequestError(409, "The payment period changed. Refresh the review.");
    return await commit(command, action, { review, payment: { id, agency: payment.agency_name, month: payment.payroll_month,
      amount: payment.withheld, penalty: payment.entered_penalty, reference: payment.payment_reference, paymentDate: payment.payment_date } }, {
      remittance_id: { id, state: action === "APPROVE" ? "APPROVED" : "RETURNED",
        ...(action === "RETURN" ? { live_key: null, return_reason: request!.reason } : {}) },
      period_command_id: period, reason: request?.reason || null,
    });
  } catch (error) {
    const saved = await replay(command);
    if (saved) return saved;
    throw error;
  }
}

export async function decideRemittanceApproval(id: string, body: unknown, key: string | null, actor: AgencyActor) {
  const request = parseInput(input, body);
  return decisionSummary(await decide(id, request, command(parseInput(z.uuid(), key), [id, request], actor)));
}

export async function bulkApproveRemittances(body: unknown, key: string | null, actor: AgencyActor) {
  const { ids } = parseInput(bulkInput, body);
  const batch = command(parseInput(z.uuid(), key), ids, actor);
  if (!await replay(batch)) await commit(batch, "BULK_START", { ids });
  const complete = command(loanCommandPartKey(batch.key, "result"), batch.requestHash, actor);
  const saved = await replay(complete);
  if (saved) return batchResult.parse(saved.evidence);
  const openMonth = await readOpenMonth();
  if (!openMonth) throw new LoanRequestError(409, "The open payment period is unavailable.");
  const period = await nextPeriodCommand(openMonth, openMonth);
  const items = await mapLimit(ids, 4, async id => {
    const part = command(loanCommandPartKey(batch.key, id), [batch.requestHash, id], actor);
    try {
      await decide(id, null, part, { openMonth, period });
      return { id, approved: true, reason: null };
    } catch (error) {
      if (!(error instanceof LoanRequestError) || error.status >= 500) throw error;
      return { id, approved: false, reason: error.message };
    }
  });
  return batchResult.parse((await commit(complete, "BULK_COMPLETE", { items })).evidence);
}
