import { readEnrollmentCsv } from "../enrollment/import-csv";
import { exactMoney } from "../enrollment/rules";
import { payrollReceiptRow, type PayrollReceiptRow } from "./contract";
import type { PayrollHandoffPayload } from "./types";

const instructionHeaders = [
  "handoff_id", "instruction_id", "action", "employee_id", "agency_code", "program", "agency_reference", "payroll_loan_id",
  "effective_month", "monthly_amount", "remaining_installments", "related_instruction_id", "cutoff_ids", "reason",
];
const receiptColumns = {
  handoffId: "handoff_id", instructionId: "instruction_id", result: "result", receiptId: "receipt_reference",
  acknowledgedAt: "acknowledged_at", effectiveMonth: "effective_month", cutoffId: "cutoff_id", payrollLoanId: "payroll_loan_id",
  monthlyAmount: "monthly_amount", remainingInstallments: "remaining_installments", reason: "reason",
} as const;
export const payrollReceiptTemplate = Object.values(receiptColumns).join(",") + "\r\n";
export const payrollReceiptMaxBytes = 16 * 1024;

const spreadsheetFormula = /^[\s\uFEFF]*[=+\-@＝＋－＠]|^[\t\r\n]/u;
function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  const safe = spreadsheetFormula.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function payrollAcknowledgementTemplate(payload: PayrollHandoffPayload) {
  const instructions = payload.stop ? [payload.stop, payload.start] : [payload.start];
  return payrollReceiptTemplate + instructions.map(instruction =>
    [payload.handoffId, instruction.id, "", "", "", instruction.effectiveMonth, "", "", "", "", ""].map(csvCell).join(","),
  ).join("\r\n") + "\r\n";
}

export function payrollInstructionCsv(payload: PayrollHandoffPayload) {
  const { handoffId, employeeId, benefitCode, program, start, stop } = payload;
  const rows = [[handoffId, start.id, "START", employeeId, benefitCode, program, start.agencyReference, start.payrollLoanId,
    start.effectiveMonth, exactMoney(start.monthlyAmount), start.remainingInstallments, stop?.id, start.cutoffIds?.join("|"), ""]];
  if (stop) {
    rows.unshift([handoffId, stop.id, "STOP", employeeId, benefitCode, "", "", stop.payrollLoanId,
      stop.effectiveMonth, "", "", start.id, stop.cutoffId, "Replaced by new loan"]);
  }
  return "\uFEFF" + [instructionHeaders.join(","), ...rows.map(row => row.map(csvCell).join(","))].join("\r\n") + "\r\n";
}

function optionalInteger(value: string) {
  if (!value) return undefined;
  return /^\d+$/.test(value) ? Number(value) : NaN;
}

export function readPayrollReceiptCsv(text: string, payload: PayrollHandoffPayload): PayrollReceiptRow[] {
  const { headers, rows } = readEnrollmentCsv(text);
  const fields = Object.values(receiptColumns);
  if (headers.length !== fields.length || fields.some(value => !headers.includes(value))) {
    throw new Error("Use the columns in the Payroll acknowledgement template.");
  }
  if (rows.length > (payload.stop ? 2 : 1)) throw new Error("Use one row per instruction for this handoff.");
  const seen = new Set<string>();
  return rows.map(({ rowNumber, cells }) => {
    if (cells.length !== headers.length || cells.some(cell => spreadsheetFormula.test(cell))) {
      throw new Error(`Check the CSV values in row ${rowNumber}. Use plain text and numbers.`);
    }
    const value = (field: keyof typeof receiptColumns) => cells[headers.indexOf(receiptColumns[field])].trim();
    const result = payrollReceiptRow.safeParse({
      handoffId: value("handoffId").toLowerCase(), instructionId: value("instructionId").toLowerCase(),
      result: value("result").toUpperCase(), receiptId: value("receiptId"), acknowledgedAt: value("acknowledgedAt"),
      effectiveMonth: value("effectiveMonth"), cutoffId: optionalInteger(value("cutoffId")),
      payrollLoanId: optionalInteger(value("payrollLoanId")), monthlyAmount: value("monthlyAmount") || undefined,
      remainingInstallments: optionalInteger(value("remainingInstallments")), reason: value("reason"),
    });
    if (!result.success) {
      const field = result.error.issues[0]?.path[0] as keyof typeof receiptColumns;
      throw new Error(`Check ${receiptColumns[field] ?? "the acknowledgement fields"} in CSV row ${rowNumber}.`);
    }
    const receipt = result.data;
    if (receipt.handoffId !== payload.handoffId ||
      (receipt.instructionId !== payload.start.id && receipt.instructionId !== payload.stop?.id)) {
      throw new Error(`CSV row ${rowNumber} does not belong to this handoff.`);
    }
    if (seen.has(receipt.instructionId)) throw new Error(`CSV row ${rowNumber} repeats an instruction.`);
    seen.add(receipt.instructionId);
    return {
      ...receipt, acknowledgedAt: new Date(receipt.acknowledgedAt).toISOString(),
      ...(receipt.result === "ACCEPTED" && receipt.monthlyAmount ? { monthlyAmount: exactMoney(receipt.monthlyAmount) } : {}),
    };
  });
}
