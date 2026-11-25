import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { peso } from "@/modules/financial-management/cooperative/members/format";
import { amountFromCentavos } from "../loans/position";
import { monthAfter } from "../loans/monthly-payroll";
import { centavos } from "../payroll-handoff/contract";
import { DEADLINE_RULES } from "../remittances/agencies/types";
import { needsBillingReview } from "../remittances/billing/reconcile";
import { remitKey, remittanceDeadline } from "../remittances/preparation/rules";
import { getAgencyBillingSummary } from "./agency-billing";
import type { AgencyActor } from "./agencies";
import { GOVERNMENT_LOAN_AGENCIES, GOVERNMENT_LOAN_CLOSES, GOVERNMENT_LOAN_PAYROLL_RESULTS,
  GOVERNMENT_LOAN_REQUESTS, GovernmentLoansDirectusError, writeGovernmentLoansItem } from "./directus";
import { readEnrollmentRows, readGroups } from "./enrollment-sources";
import { readChangeInstructions } from "./loan-changes";
import { isoDateTime } from "./loan-requests";
import { buildAgencyRollforward, readOpeningRollforward, rollforwardSchema } from "./month-end-rollforward";
import { payrollMoney, payrollMonth, readLatestReceipts, readPayrollPages, receiptSummary } from "./payroll-month-store";
import { nextPeriodCommand, readOpenMonth } from "./period-commands";
import { readRemittanceOverview } from "./remittance-records";
import { flag, LoanRequestError, pageNumber, parseInput, positiveId } from "./request-input";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const agencySchema = z.object({ id: positiveId, display_name: z.string(), short_code: z.string(), revision: positiveId, is_active: flag,
  sends_billing: flag, deadline_rule: z.enum(Object.keys(DEADLINE_RULES) as ["FIXED_DAY", "END_OF_MONTH"]),
  deadline_day: z.number().int().nullable() });
const resultSchema = z.object({ month: payrollMonth, receipt_id: z.uuid(), agency_id: positiveId, request_id: positiveId,
  status: z.enum(["D", "P", "F", "X"]), amount: payrollMoney, expected: payrollMoney });
const loanSchema = z.object({ id: positiveId, employee_name: z.string().nullable() });
const periodFields = "id,month,next_month,closed_at,actor_id,actor_name,actor_role,reason,checklist,rollforward,command_key,request_hash";
const item = z.object({ key: z.string(), label: z.string(), detail: z.string(), source: z.record(z.string(), z.unknown()) });
const group = z.object({ key: z.enum(["remittance", "approval", "loans", "billing", "refund"]), label: z.string(), items: z.array(item) });
const checklistSchema = z.object({
  month: payrollMonth, endDate: z.iso.date(), nextMonth: payrollMonth,
  payroll: z.object({ id: z.uuid(), revision: positiveId, receivedAt: z.string(), receivedBy: z.string(),
    previousId: z.uuid().nullable(), reason: z.string().nullable() }).nullable(),
  resultCount: z.number().int().nonnegative(), groups: z.array(group), finalPay: z.array(item), openItemCount: z.number().int().nonnegative(),
  agencyRevisions: z.array(z.object({ id: positiveId, revision: positiveId })),
  billingRevisions: z.array(z.object({ agencyId: positiveId, revisionId: z.uuid().nullable() })),
});
type Checklist = z.output<typeof checklistSchema>;
type Item = z.output<typeof item>;
const closeRow = z.object({ id: z.uuid(), month: payrollMonth, next_month: payrollMonth, closed_at: z.string(),
  actor_id: positiveId, actor_name: z.string(), actor_role: z.string().nullable(), reason: z.string().nullable(),
  checklist: checklistSchema, rollforward: rollforwardSchema.nullish().transform(value => value ?? null),
  command_key: z.uuid(), request_hash: z.string() });

function monthEnd(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
}

async function buildChecklist(month: string) {
  const endDate = monthEnd(month);
  const [agencies, receipts, payments, instructions, previous] = await Promise.all([
    readPayrollPages(GOVERNMENT_LOAN_AGENCIES, agencySchema, Object.keys(agencySchema.shape).join(","), {}, "id"),
    readLatestReceipts("1000-01", month),
    readRemittanceOverview({ _or: [{ payroll_month: { _lt: month } },
      { state: { _eq: "APPROVED" }, payment_date: { _lte: endDate } }] }),
    readChangeInstructions({ action: { _in: ["SEPARATION", "REFUND"] }, effective_month: { _lte: month },
      state: { _nin: ["CANCELLED", "PAID"] } }),
    readOpeningRollforward(monthAfter(month, -1)),
  ]);
  const resultRows: z.output<typeof resultSchema>[] = [];
  const receiptIds = [...receipts.values()].map(receipt => receipt.id);
  for (let start = 0; start < receiptIds.length; start += 25) {
    resultRows.push(...await readPayrollPages(GOVERNMENT_LOAN_PAYROLL_RESULTS, resultSchema, Object.keys(resultSchema.shape).join(","),
      { receipt_id: { _in: receiptIds.slice(start, start + 25) } }, "id"));
  }
  const current = receipts.get(month);
  const approved = new Set(payments.filter(row => row.state === "APPROVED").map(row => remitKey(row.agency_id, row.payroll_month)));
  const attempts = new Map<string, typeof payments[number]>();
  for (const payment of payments) {
    const key = remitKey(payment.agency_id, payment.payroll_month);
    const current = attempts.get(key);
    if (!current || (current.state === "RETURNED" && payment.state !== "RETURNED")) attempts.set(key, payment);
  }
  const byAgency = new Map(agencies.map(agency => [agency.id, agency]));
  const withholding = new Map<string, { agencyId: number; month: string; amount: bigint; receiptId: string }>();
  const finalResults = new Map<number, z.output<typeof resultSchema>>();
  const activeBilling = new Set<number>();
  for (const result of resultRows) {
    if (result.month === month) activeBilling.add(result.agency_id);
    if (result.status === "X" && (!finalResults.has(result.request_id) || finalResults.get(result.request_id)!.month < result.month)) {
      finalResults.set(result.request_id, result);
    }
    if (result.status === "F") continue;
    const key = remitKey(result.agency_id, result.month);
    const group = withholding.get(key) ?? { agencyId: result.agency_id, month: result.month, amount: 0n, receiptId: result.receipt_id };
    group.amount += centavos(result.amount);
    withholding.set(key, group);
  }
  const remittance: Item[] = [];
  const approval: Item[] = [];
  for (const [key, entry] of [...withholding].sort(([a], [b]) => a.localeCompare(b))) {
    if (entry.month === month || entry.amount === 0n || approved.has(key)) continue;
    const agency = byAgency.get(entry.agencyId);
    if (!agency) throw new LoanRequestError(503, "An agency for confirmed withholding is unavailable.");
    const attempt = attempts.get(key);
    const due = attempt?.due_date ?? remittanceDeadline(entry.month, { deadlineRule: agency.deadline_rule, deadlineDay: agency.deadline_day });
    if (due > endDate) continue;
    const row = { key, label: agency.display_name + " · " + entry.month, detail: peso(amountFromCentavos(entry.amount)) + " due " + due +
      (attempt?.state === "PENDING" ? " · Awaiting approval" : attempt?.state === "RETURNED" ? " · Returned" : " · Missing") +
      (attempt ? " · " + attempt.payment_reference : ""),
      source: { agencyId: agency.id, payrollMonth: entry.month, receiptId: entry.receiptId, dueDate: due,
        amount: amountFromCentavos(entry.amount), remittanceId: attempt?.id ?? null, reference: attempt?.payment_reference ?? null,
        state: attempt?.state ?? "MISSING" } };
    (attempt?.state === "PENDING" ? approval : remittance).push(row);
  }

  const names = await readGroups<z.output<typeof loanSchema>, number>(GOVERNMENT_LOAN_REQUESTS, loanSchema,
    instructions.map(row => row.request_id), ids => ({ id: { _in: ids } }), "id");
  const nameByLoan = new Map(names.map(row => [row.id, row.employee_name]));
  const finalPay: Item[] = [];
  const separation: Item[] = [];
  const refund: Item[] = [];
  for (const instruction of instructions) {
    const label = (nameByLoan.get(instruction.request_id) ?? "Employee #" + instruction.employee_id) +
      " · Loan #" + instruction.request_id + " · " + instruction.agency_reference;
    const source = { loanId: instruction.request_id, instructionId: instruction.id, effectiveMonth: instruction.effective_month };
    if (instruction.action === "REFUND") {
      const amount = payrollMoney.parse(instruction.details.amount);
      refund.push({ key: instruction.id, label, detail: peso(amount) + " · " + instruction.state.toLowerCase(),
        source: { ...source, amount, state: instruction.state, reference: instruction.details.reference ?? null } });
    } else {
      const result = finalResults.get(instruction.request_id);
      if (!result || result.month < instruction.effective_month) {
        separation.push({ key: instruction.id, label, detail: "Final pay result pending from " + instruction.effective_month, source });
      } else {
        const unpaid = amountFromCentavos(centavos(result.expected) - centavos(result.amount));
        finalPay.push({ key: instruction.id, label, detail: peso(result.amount) + " withheld · " + peso(unpaid) + " unpaid",
          source: { ...source, receiptId: result.receipt_id, resultMonth: result.month, withheld: result.amount, unpaid } });
      }
    }
  }

  const billing: Item[] = [];
  const billingRevisions: Checklist["billingRevisions"] = [];
  if (current) for (const agency of agencies) {
    if (!agency.sends_billing || (!agency.is_active && !activeBilling.has(agency.id))) continue;
    const summary = await getAgencyBillingSummary(agency.id, month);
    if (summary.payrollReceipt?.id !== current.id) throw stale();
    const revisionId = summary.billingRevision?.id ?? null;
    billingRevisions.push({ agencyId: agency.id, revisionId });
    if (!revisionId) {
      billing.push({ key: String(agency.id), label: agency.display_name, detail: "Expected agency bill is missing",
        source: { agencyId: agency.id, receiptId: current.id } });
      continue;
    }
    for (const row of summary.rows.filter(needsBillingReview)) billing.push({ key: agency.id + ":" + row.key,
      label: agency.display_name + " · " + (row.loanReference ?? row.systemReference ?? row.key),
      detail: row.reasons.map(reason => reason.code.toLowerCase().replaceAll("_", " ")).join(", "),
      source: { agencyId: agency.id, revisionId, receiptId: current.id, loanId: row.loanId, difference: row.difference } });
  }
  const groups: Checklist["groups"] = [
    { key: "remittance", label: "Missing or returned remittances", items: remittance },
    { key: "approval", label: "Remittances awaiting approval", items: approval },
    { key: "loans", label: "Final pay results outstanding", items: separation },
    { key: "billing", label: "Agency billing exceptions", items: billing },
    { key: "refund", label: "Employee refunds unpaid", items: refund },
  ];
  const checklist: Checklist = { month, endDate, nextMonth: monthAfter(month), payroll: current ? receiptSummary(current) : null,
    resultCount: resultRows.filter(row => row.month === month).length,
    groups, finalPay, openItemCount: groups.reduce((total, entry) => total + entry.items.length, 0),
    agencyRevisions: agencies.map(({ id, revision }) => ({ id, revision })), billingRevisions };
  return { checklist, rollforward: await buildAgencyRollforward(month, endDate, agencies, receipts, [...withholding.values()], payments, previous) };
}

function stale() {
  return new LoanRequestError(409, "The open period or its evidence changed. Review a fresh checklist.");
}

async function preview(month: string) {
  const period = await nextPeriodCommand(month);
  const { checklist, rollforward } = await buildChecklist(month);
  if (await readOpenMonth() !== month) throw stale();
  return { checklist, rollforward, period, token: digest([checklist, rollforward, period.revision_key]) };
}

async function readClose(filter: object, sort?: string) {
  const [row] = await readEnrollmentRows(GOVERNMENT_LOAN_CLOSES, closeRow, periodFields, filter, 1, sort);
  return row ?? null;
}

function closeSummary(row: z.output<typeof closeRow>) {
  return { id: row.id, month: row.month, nextMonth: row.next_month, actor: row.actor_name,
    closedAt: isoDateTime(row.closed_at), reason: row.reason, checklist: row.checklist, rollforward: row.rollforward };
}

const historyRow = closeRow.pick({ id: true, month: true, closed_at: true, actor_name: true, reason: true });
const historyPageSize = 20;
export async function viewMonthEndClose(params = new URLSearchParams()) {
  const { month: requested, page } = parseInput(z.object({ month: payrollMonth.optional(), page: pageNumber }), Object.fromEntries(params));
  const [openMonth, history] = await Promise.all([readOpenMonth(),
    readEnrollmentRows(GOVERNMENT_LOAN_CLOSES, historyRow, "id,month,closed_at,actor_name,reason", {}, historyPageSize + 1,
      "-month", (page - 1) * historyPageSize)]);
  const selected = requested ?? openMonth;
  const [current, saved] = await Promise.all([
    selected && selected === openMonth ? preview(selected) : null,
    selected && selected !== openMonth ? readClose({ month: { _eq: selected } }) : null,
  ]);
  if (requested && requested !== openMonth && !saved) throw new LoanRequestError(404, "No close snapshot exists for this month.");
  return { openMonth, current: current ? { checklist: current.checklist, rollforward: current.rollforward, token: current.token } : null,
    saved: saved ? closeSummary(saved) : null,
    history: history.slice(0, historyPageSize).map(row => ({ id: row.id, month: row.month, actor: row.actor_name,
      closedAt: isoDateTime(row.closed_at), reason: row.reason })), historyPage: page, historyHasMore: history.length > historyPageSize };
}

export async function readCloseExport(requested: string | null) {
  const open = await readOpenMonth();
  const month = requested === null ? open : parseInput(payrollMonth, requested);
  if (!month) throw new LoanRequestError(404, "Select a period to export.");
  if (month === open) {
    const { checklist, rollforward } = await preview(month);
    return { checklist, rollforward, saved: null };
  }
  const row = await readClose({ month: { _eq: month } });
  if (!row) throw new LoanRequestError(404, "No close snapshot exists for this month.");
  const saved = closeSummary(row);
  return { checklist: saved.checklist, rollforward: saved.rollforward, saved };
}

const closeInput = z.strictObject({ month: payrollMonth, token: z.string().regex(/^[a-f0-9]{64}$/), reason: z.string().trim().max(1000).default("") });

export async function closeGovernmentLoanMonth(body: unknown, keyInput: string | null, actor: AgencyActor) {
  const request = parseInput(closeInput, body);
  const key = parseInput(z.uuid(), keyInput);
  const requestHash = digest([request, actor.actorId]);
  const replay = async () => {
    const row = await readClose({ command_key: { _eq: key } });
    if (!row) return null;
    if (row.request_hash !== requestHash) throw new LoanRequestError(409, "This close request key was already used.");
    return closeSummary(row);
  };
  const existing = await replay();
  if (existing) return existing;
  try {
    if (await readOpenMonth() !== request.month) throw stale();
    const { checklist, rollforward, period, token } = await preview(request.month);
    if (!checklist.payroll) throw new LoanRequestError(409, "Confirm complete Payroll results before closing this month.");
    if (token !== request.token) throw stale();
    if (checklist.openItemCount && !request.reason) throw new LoanRequestError(422, "Enter a reason for closing with open items.");
    const row = { id: randomUUID(), month: request.month, next_month: checklist.nextMonth, reason: request.reason || null,
      actor_id: actor.actorId, actor_name: actor.actorName, actor_role: actor.actorRole, closed_at: new Date().toISOString(),
      checklist, rollforward, command_key: key, request_hash: requestHash };
    await writeGovernmentLoansItem(GOVERNMENT_LOAN_CLOSES, { ...row, period_command_id: period,
      settings_id: { id: 1, open_month: checklist.nextMonth }, audit: { action: "PERIOD_CLOSED", payrollReceiptId: checklist.payroll.id } },
    "id", undefined, 30_000);
    return closeSummary(row);
  } catch (error) {
    const saved = await replay();
    if (saved) return saved;
    if (error instanceof GovernmentLoansDirectusError && error.code === "RECORD_NOT_UNIQUE") throw stale();
    throw error;
  }
}
