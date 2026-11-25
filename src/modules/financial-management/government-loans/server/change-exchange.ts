import "server-only";

import { z } from "zod";
import { todayManila } from "@/modules/financial-management/cooperative/members/format";
import { readEnrollmentCsv } from "../enrollment/import-csv";
import type { AgencyActor } from "./agencies";
import { type ChangeInstruction, readChangeInstructions, readOpenLoanMonth } from "./loan-changes";
import { readRegisterLoan } from "./loan-register";
import { commitRequestRevision, loanCommand, loanCommandPartKey, readCommandReceipt } from "./loan-requests";
import { readPayrollContract } from "./payroll-month-store";
import { nextPeriodCommand } from "./period-commands";
import { LoanRequestError, parseInput, positiveId } from "./request-input";

const proofHeaders = ["instruction_id", "transmission_id", "payroll_loan_id", "effective_month", "result", "reference", "date"];
const proof = z.object({
  instructionId: z.uuid(), transmissionId: z.uuid(), payrollLoanId: positiveId, effectiveMonth: z.string(),
  result: z.enum(["ACKNOWLEDGED", "NOT_APPLIED", "PAID"]), reference: z.string().trim().min(1).max(200),
  date: z.iso.date(),
});

function csvCell(value: string | number | null) {
  const text = String(value ?? "");
  const safe = /^[\s\uFEFF]*[=+\-@＝＋－＠]|^[\t\r\n]/u.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

function instructionFile(row: ChangeInstruction) {
  const { details } = row;
  const values = [row.id, typeof details.transmissionId === "string" ? details.transmissionId : null,
    row.action, row.employee_id, row.payroll_loan_id, row.agency_reference, row.effective_month,
    typeof details.amount === "string" ? details.amount : typeof details.balance === "string" ? details.balance : null,
    typeof details.throughMonth === "string" ? details.throughMonth : null,
    typeof details.reference === "string" ? details.reference : typeof details.statementId === "string" ? details.statementId : null,
    typeof details.separationDate === "string" ? details.separationDate : null,
    typeof details.originalInstructionId === "string" ? details.originalInstructionId : null];
  return new Response("instruction_id,transmission_id,action,employee_id,payroll_loan_id,agency_reference,effective_month,amount,through_month,source_reference,separation_date,original_instruction_id\r\n" +
    values.map(csvCell).join(",") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="loan-instruction-' + row.id + '.csv"',
      "X-Content-Type-Options": "nosniff" },
  });
}

const exchange = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("EXPORT"), instructionId: z.uuid(), expectedRevision: positiveId }),
  z.object({ kind: z.literal("IMPORT"), instructionId: z.uuid(), expectedRevision: positiveId, csv: z.string().min(1).max(8192) }),
]);

function readProof(text: string) {
  try {
    const { headers, rows } = readEnrollmentCsv(text);
    if (rows.length !== 1 || headers.length !== proofHeaders.length || proofHeaders.some(column => !headers.includes(column))) {
      throw new Error("Invalid template");
    }
    const value = (column: string) => rows[0].cells[headers.indexOf(column)]?.trim();
    return proof.parse({
      instructionId: value("instruction_id"), transmissionId: value("transmission_id"),
      payrollLoanId: value("payroll_loan_id"), effectiveMonth: value("effective_month"),
      result: value("result"), reference: value("reference"), date: value("date"),
    });
  } catch {
    throw new LoanRequestError(422, "Use one complete row from the Payroll change acknowledgement template.");
  }
}

export async function exchangeLoanInstruction(id: number, body: unknown, key: string | null, actor: AgencyActor) {
  const input = parseInput(exchange, body);
  const command = loanCommand(key, { operation: "exchange-loan-instruction", ...input }, actor, id);
  const prior = await readCommandReceipt(command);
  const month = await readOpenLoanMonth();
  const guard = await nextPeriodCommand(month);
  const [row] = await readChangeInstructions({ id: { _eq: input.instructionId }, request_id: { _eq: id } });
  if (!row) throw new LoanRequestError(404, "Payroll instruction could not be found.");
  if (prior) return input.kind === "EXPORT" ? instructionFile({ ...row, details: committedExchangeDetails(prior.after_values) }) : { revision: prior.revision };
  if (!row.payroll_loan_id) throw new LoanRequestError(409, "Verify the Payroll loan link before exchanging this instruction.");
  const { loan } = await readRegisterLoan(id);
  if (loan.revision !== input.expectedRevision) throw new LoanRequestError(409, "The loan changed. Reload the instruction.");
  const now = new Date().toISOString();
  let state: ChangeInstruction["state"] = "EXPORTED";
  let details = row.details;
  let reversed: ChangeInstruction | undefined;
  if (input.kind === "EXPORT") {
    if (row.state === "EXPORTED") return instructionFile(row);
    if (row.state !== "QUEUED" && row.state !== "RETRYABLE") throw new LoanRequestError(409, "This instruction is not ready for export.");
    if (row.effective_month < month) throw new LoanRequestError(409, "Payroll cannot apply a new instruction to a closed month.");
    details = { ...details, exportedAt: now, transmissionId: loanCommandPartKey(command.key, "transmission") };
  } else {
    const receipt = readProof(input.csv);
    if (receipt.instructionId !== row.id || receipt.transmissionId !== details.transmissionId ||
      receipt.payrollLoanId !== row.payroll_loan_id || receipt.effectiveMonth !== row.effective_month ||
      receipt.date > todayManila() || receipt.date.slice(0, 7) !== month) {
      throw new LoanRequestError(422, "The receipt must match the latest export, loan, and open-month Payroll date.");
    }
    if (receipt.result === "PAID") {
      const contract = await readPayrollContract(month);
      const payout = contract?.refundPayouts.find(payout => payout.instructionId === row.id);
      if (row.action !== "REFUND" || row.state !== "ACKNOWLEDGED" || !payout || payout.reference !== receipt.reference ||
        payout.paidOn !== receipt.date || payout.amount !== details.amount) {
        throw new LoanRequestError(409, "The refund needs an acknowledged instruction and a matching verified Payroll payout.");
      }
      state = "PAID";
    } else {
      if (row.state !== "EXPORTED") throw new LoanRequestError(409, "Only exported instructions can receive a Payroll acknowledgement.");
      state = receipt.result === "ACKNOWLEDGED" ? "ACKNOWLEDGED" : "RETRYABLE";
      if (state === "ACKNOWLEDGED" && row.action === "REVERSE") {
        if (typeof row.details.originalInstructionId !== "string") throw new LoanRequestError(409, "The original instruction could not be confirmed.");
        [reversed] = await readChangeInstructions({ id: { _eq: row.details.originalInstructionId }, request_id: { _eq: id } });
        if (reversed?.state !== "REVERSING") throw new LoanRequestError(409, "The original instruction changed. Review the reversal.");
      }
    }
    details = { ...details, ...(state === "PAID" ? { payout: receipt } : { acknowledgement: receipt }) };
  }
  if (month !== await readOpenLoanMonth()) throw new LoanRequestError(409, "The open month changed. Reload the instruction.");
  const committed = await commitRequestRevision(command, "LOAN_CHANGE_PAYROLL_UPDATED", { id, revision: loan.revision, status: "ACTIVE" },
    { change_instructions: { update: [{ id: row.id, state, details },
      ...(reversed ? [{ id: reversed.id, state: "CANCELLED" }] : [])] } }, { status: "ACTIVE", instructionState: row.state },
    { status: "ACTIVE", instructionId: row.id, instructionState: state, details, remarks: "Payroll instruction " + state.toLowerCase() }, now, guard);
  return input.kind === "EXPORT" ? instructionFile({ ...row, details: committedExchangeDetails(committed.after_values), state }) : { revision: committed.revision };
}

function committedExchangeDetails(value: unknown) {
  return z.object({ details: z.record(z.string(), z.unknown()) }).parse(value).details;
}
