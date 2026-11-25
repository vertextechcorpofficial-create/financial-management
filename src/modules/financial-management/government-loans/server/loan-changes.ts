import "server-only";

import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { changeLabels } from "../loans/lifecycle";
import { monthAfter } from "../loans/monthly-payroll";
import { amountFromCentavos, projectLoanPosition } from "../loans/position";
import { centavos } from "../payroll-handoff/contract";
import { GOVERNMENT_LOAN_CHANGE_INSTRUCTIONS, GOVERNMENT_LOAN_REQUEST_HISTORY } from "./directus";
import { readEnrollmentRows } from "./enrollment-sources";
import { readOpenMonth } from "./loan-enrollment";
import { getRegisterLoan, readLoanSchedule } from "./loan-register";
import { commitRequestRevision, loanCommand, loanCommandPartKey, readCommandReceipt } from "./loan-requests";
import { nextPeriodCommand } from "./period-commands";
import { payrollMoney, payrollMonth, readMonthReceipts, readPayrollContract, readPayrollPages } from "./payroll-month-store";
import { LoanRequestError, parseInput, positiveId } from "./request-input";
import type { AgencyActor } from "./agencies";

const note = z.string().trim().max(500).default("");
const reference = z.string().trim().min(1).max(200);
const amount = payrollMoney.refine(value => value !== "0.00");
const change = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("AMORTIZATION"), month: payrollMonth, amount }),
  z.object({ kind: z.literal("SUSPENSION"), month: payrollMonth, throughMonth: payrollMonth }),
  z.object({ kind: z.literal("PAID_DIRECTLY"), reference }),
  z.object({ kind: z.literal("SEPARATION"), separationDate: z.iso.date(), statementId: z.uuid() }),
  z.object({ kind: z.literal("REFUND"), amount, reference }),
  z.object({ kind: z.literal("REVERSE"), revision: positiveId, reason: note.refine(Boolean) }),
]);
const input = z.object({ expectedRevision: positiveId, change, note });
const actions = ["LOAN_TERMS_CHANGED", "LOAN_REFUND_RECORDED", "LOAN_TERMS_CHANGE_REVERSED"] as const;
const after = z.object({
  instructionId: z.uuid(), recordedMonth: payrollMonth, remarks: z.string(),
  loanChange: z.object({ kind: z.enum(Object.keys(changeLabels) as [keyof typeof changeLabels, ...(keyof typeof changeLabels)[]]),
    month: payrollMonth, amount: payrollMoney.optional(), throughMonth: payrollMonth.optional(), reference: z.string().optional() }).optional(),
  reversedRevision: positiveId.optional(),
});
const historyRow = z.object({ request_id: positiveId, action: z.enum(actions), revision: positiveId,
  actor_name: z.string(), occurred_at: z.string(), after_values: after });

const outbound = z.object({
  id: z.uuid(), request_id: positiveId, event_revision: positiveId, effective_month: payrollMonth,
  action: z.enum(["AMORTIZATION", "SUSPENSION", "PAID_DIRECTLY", "SEPARATION", "REFUND", "REVERSE"]),
  employee_id: positiveId, payroll_loan_id: positiveId.nullable(), agency_reference: z.string(), details: z.record(z.string(), z.unknown()),
  recorded_at: z.string(), state: z.enum(["QUEUED", "EXPORTED", "ACKNOWLEDGED", "RETRYABLE", "REVERSING", "PAID", "CANCELLED"]),
});
export type ChangeInstruction = z.output<typeof outbound>;
export const changeInstructionFields = Object.keys(outbound.shape).join(",");

export async function readChangeInstructions(filter: object) {
  return readPayrollPages(GOVERNMENT_LOAN_CHANGE_INSTRUCTIONS, outbound, changeInstructionFields, filter, "-recorded_at,id");
}

export async function pendingRefundLoanIds(ids: number[]) {
  const pending = new Set<number>();
  for (let start = 0; start < ids.length; start += 50) {
    const instructions = await readChangeInstructions({
      request_id: { _in: ids.slice(start, start + 50) }, action: { _eq: "REFUND" },
      state: { _in: ["QUEUED", "EXPORTED", "ACKNOWLEDGED", "RETRYABLE", "REVERSING"] },
    });
    for (const instruction of instructions) pending.add(instruction.request_id);
  }
  return pending;
}

export async function readOpenLoanMonth() {
  const month = await readOpenMonth();
  if (!month) throw new LoanRequestError(503, "Set the Government Loans open month first.");
  return month;
}

const loadHistory = (id: number) => readPayrollPages(GOVERNMENT_LOAN_REQUEST_HISTORY, historyRow,
  Object.keys(historyRow.shape).join(","), { request_id: { _eq: id }, action: { _in: actions } }, "-revision,id");

export async function getLoanChanges(id: number) {
  const [detail, history, instructions] = await Promise.all([
    getRegisterLoan(id, new URLSearchParams()), loadHistory(id), readChangeInstructions({ request_id: { _eq: id } }),
  ]);
  const reversed = new Set(history.map(event => event.after_values.reversedRevision));
  const settled = detail.loan.status === "SEPARATED" ? (await readLoanSchedule(id, detail.openMonth)).history.find(result => result.status === "X") : undefined;
  const finalPay = settled ? { withheld: settled.amount, unpaid: amountFromCentavos(centavos(settled.expected) - centavos(settled.amount)) } : null;
  return { ...detail, finalPay, history: history.map(event => ({ ...event, reversed: reversed.has(event.revision) })), instructions };
}

const statementEvidence = z.object({ id: z.uuid(), statement_date: z.iso.date(), balance: payrollMoney });

export async function recordLoanChange(id: number, body: unknown, key: string | null, actor: AgencyActor) {
  const data = parseInput(input, body);
  const command = loanCommand(key, { operation: "loan-change", ...data }, actor, id);
  const previous = await readCommandReceipt(command);
  if (previous) return { revision: previous.revision };

  const month = await readOpenLoanMonth();
  const guard = await nextPeriodCommand(month);
  const [selected, history, receipts, instructions] = await Promise.all([
    readLoanSchedule(id, month), loadHistory(id), readMonthReceipts(month), readChangeInstructions({ request_id: { _eq: id } }),
  ]);
  if (selected.row.revision !== data.expectedRevision) throw new LoanRequestError(409, "The loan changed. Reload and review it.");
  const today = todayManila();
  const position = projectLoanPosition({ ...selected.schedule, openMonth: month, businessDate: today,
    deductions: selected.history, statement: null, coveredThrough: selected.coveredThrough });
  const requested = data.change;
  if (requested.kind !== "REVERSE" && requested.kind !== "REFUND" && !position.active) {
    throw new LoanRequestError(409, "The loan is already closed.");
  }
  if (requested.kind !== "REVERSE" && requested.kind !== "REFUND" &&
    selected.schedule.changes.some(event => !event.reversed && (event.kind === "SEPARATION" || event.kind === "PAID_DIRECTLY" ||
      (requested.kind === "SEPARATION" && event.kind === "RENEWED")))) {
    throw new LoanRequestError(409, "Resolve the existing stop or final-pay instruction first.");
  }

  let effective = month;
  let details: Record<string, unknown> = {};
  let action: typeof actions[number] = "LOAN_TERMS_CHANGED";
  let replaced: ChangeInstruction | undefined;
  let remarks: string = requested.kind === "REVERSE" ? requested.reason : changeLabels[requested.kind];
  switch (requested.kind) {
    case "AMORTIZATION":
      if (requested.month < month || requested.month > monthAfter(month, 2)) {
        throw new LoanRequestError(422, "Choose the open month or either of the following two months.");
      }
      effective = requested.month;
      details = { amount: requested.amount, previousAmount: position.amortization };
      break;
    case "SUSPENSION":
      if (requested.month < month || requested.throughMonth < requested.month) {
        throw new LoanRequestError(422, "Choose an ordered suspension range starting in an open month.");
      }
      effective = requested.month;
      details = { throughMonth: requested.throughMonth };
      break;
    case "PAID_DIRECTLY":
      details = { reference: requested.reference };
      break;
    case "SEPARATION": {
      if (requested.separationDate.startsWith("0000")) throw new LoanRequestError(422, "Enter a valid separation date.");
      const [statement] = await readEnrollmentRows("government_loan_agency_statements", statementEvidence,
        "id,statement_date,balance", { id: { _eq: requested.statementId }, request_id: { _eq: id } }, 1);
      if (!statement || statement.statement_date > today || statement.balance === "0.00") {
        throw new LoanRequestError(422, "Choose a recorded agency statement with a positive outstanding balance.");
      }
      const recorded = selected.row.agency_statements[0];
      if (recorded?.id !== statement.id) throw new LoanRequestError(409, "Use the latest recorded agency statement.");
      const adjusted = projectLoanPosition({ ...selected.schedule, openMonth: month, businessDate: today, deductions: selected.history,
        coveredThrough: selected.coveredThrough, statement: {
          id: statement.id, date: statement.statement_date, balance: statement.balance, source: recorded.source,
          note: null, attachmentName: null, recordedBy: recorded.recorded_by, recordedAt: recorded.recorded_at,
        } }).agencyBalance.adjusted;
      if (adjusted === null || adjusted === "0.00") throw new LoanRequestError(409, "The verified balance is already settled.");
      effective = receipts.length ? monthAfter(month) : month;
      details = { separationDate: requested.separationDate, statementId: statement.id, statementDate: statement.statement_date, balance: adjusted };
      break;
    }
    case "REFUND": {
      action = "LOAN_REFUND_RECORDED";
      const refundKey = selected.row.agency_id + ":" + requested.reference.toUpperCase();
      const existing = await readChangeInstructions({ refund_key: { _eq: refundKey } });
      if (existing.length) throw new LoanRequestError(409, "This agency refund reference is already recorded.");
      details = { amount: requested.amount, reference: requested.reference };
      break;
    }
    case "REVERSE": {
      action = "LOAN_TERMS_CHANGE_REVERSED";
      const event = history.find(row => row.revision === requested.revision);
      replaced = instructions.find(row => row.event_revision === requested.revision);
      if (!event || event.action === "LOAN_TERMS_CHANGE_REVERSED" || !replaced ||
        history.some(row => row.after_values.reversedRevision === requested.revision)) {
        throw new LoanRequestError(409, "Select an unreversed change. Renewals use enrollment return.");
      }
      if (event.after_values.recordedMonth !== month) throw new LoanRequestError(409, "Only changes made in the open period can be reversed.");
      if (replaced.state === "PAID" || (replaced.action === "SEPARATION" && selected.history.some(row => row.status === "X" && row.month >= replaced!.effective_month))) {
        throw new LoanRequestError(409, "Payroll has already completed this instruction.");
      }
      if (replaced.action === "REFUND" && (await readPayrollContract(month))?.refundPayouts.some(payout => payout.instructionId === replaced?.id)) {
        throw new LoanRequestError(409, "Payroll has already reported this refund payout.");
      }
      effective = replaced.effective_month;
      details = { originalInstructionId: replaced.id, originalAction: replaced.action, reason: requested.reason };
      remarks = "Reversed change #" + requested.revision + " · " + requested.reason;
      break;
    }
  }
  const changesRegular = requested.kind !== "REFUND" && replaced?.action !== "REFUND";
  if (changesRegular && effective <= month && receipts.length) {
    throw new LoanRequestError(409, "The month already has a confirmed Payroll receipt. Use the Payroll correction workflow for changes to that month.");
  }
  if (month !== await readOpenLoanMonth()) throw new LoanRequestError(409, "The open month changed. Reload the loan.");

  const instructionId = loanCommandPartKey(command.key, "loan-change-instruction");
  const now = new Date().toISOString();
  const priorUnsent = replaced && ["QUEUED", "RETRYABLE"].includes(replaced.state);
  const result = await commitRequestRevision(command, action, { id, status: "ACTIVE", revision: selected.row.revision }, {
    change_instructions: {
      create: [{
        id: instructionId, event_revision: selected.row.revision + 1, effective_month: effective, action: requested.kind,
        employee_id: selected.row.employee_user_id, payroll_loan_id: selected.row.payroll_loan_id,
        agency_reference: selected.row.enrollment.agencyReference, details, recorded_at: now, state: priorUnsent ? "CANCELLED" : "QUEUED",
        refund_key: requested.kind === "REFUND" ? selected.row.agency_id + ":" + requested.reference.toUpperCase() : null,
      }],
      ...(replaced ? { update: [{ id: replaced.id, state: priorUnsent ? "CANCELLED" : "REVERSING" }] } : {}),
    },
  }, { status: "ACTIVE", position: position.status }, {
    status: "ACTIVE", instructionId, recordedMonth: month, remarks: data.note ? remarks + " · " + data.note : remarks,
    ...(requested.kind === "REVERSE" ? { reversedRevision: requested.revision } :
      { loanChange: { kind: requested.kind, month: effective, ...details } }),
  }, now, guard);
  return { revision: result.revision };
}
