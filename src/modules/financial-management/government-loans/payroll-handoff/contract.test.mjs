import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { reviewPayrollReceipts } from "./contract.ts";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith("/file-exchange.ts") && /^\.{1,2}\//.test(specifier)) {
      return nextResolve(specifier + ".ts", context);
    }
    return nextResolve(specifier, context);
  },
});
const { payrollAcknowledgementTemplate, payrollInstructionCsv, payrollReceiptTemplate, readPayrollReceiptCsv } = await import("./file-exchange.ts");

const handoffId = "ace800df-876d-445d-9ed9-f2d14e508366";
const startId = "c970ea01-12b5-4c09-91e7-1851dc5a015f";
const stopId = "5c944cbf-361e-4b63-84c6-dca7dd10e062";
const payload = {
  handoffId, enrollmentId: 418, employeeId: 10, agencyId: 21, benefitCode: "SSS", program: 'Salary Loan, "standard"',
  start: { id: startId, agencyReference: "SL-2027-418", effectiveMonth: "2027-01", monthlyAmount: "904.55",
    remainingInstallments: 16, payrollLoanId: null },
  stop: null,
};
const stop = { id: stopId, effectiveMonth: "2027-01", payrollLoanId: 100, enrollmentId: 1 };
const renewal = { ...payload, stop };
const startAck = {
  handoffId, instructionId: startId, receiptId: "PAY-1", acknowledgedAt: "2026-12-30T07:00:00.000Z",
  effectiveMonth: "2027-01", payrollLoanId: 200, remainingInstallments: 16, monthlyAmount: "904.55",
  result: "ACCEPTED", reason: "",
};
const stopAck = { handoffId, instructionId: stopId, receiptId: "PAY-2", acknowledgedAt: startAck.acknowledgedAt,
  effectiveMonth: "2027-01", payrollLoanId: 100, result: "ACCEPTED", reason: "" };
const formatReceipt = row => [row.handoffId, row.instructionId, row.result, row.receiptId, row.acknowledgedAt,
  row.effectiveMonth, row.cutoffId, row.payrollLoanId, row.monthlyAmount, row.remainingInstallments, row.reason].join(",") + "\r\n";
const readReceipt = (...rows) => readPayrollReceiptCsv(payrollReceiptTemplate + rows.map(formatReceipt).join(""), renewal);

test("the same renewal payload produces identical bytes, with its stop and start in one file", () => {
  const file = payrollInstructionCsv(renewal);
  const [, stopLine, startLine] = file.split("\r\n");
  assert.equal(payrollInstructionCsv(renewal), file);
  assert.ok(stopLine.includes(`"${stopId}","STOP"`) && stopLine.includes(`"100","2027-01"`) && stopLine.includes(startId));
  assert.ok(startLine.includes(`"${startId}","START"`) && startLine.includes(`"2027-01","904.55","16","${stopId}"`));
  assert.ok(startLine.includes('"Salary Loan, ""standard"""'));
  assert.equal(payrollInstructionCsv(payload).trimEnd().split("\r\n").length, 2);
  const [header, stopTemplate, startTemplate] = payrollAcknowledgementTemplate(renewal).split("\r\n");
  assert.equal(header + "\r\n", payrollReceiptTemplate);
  assert.ok(stopTemplate.startsWith(`"${handoffId}","${stopId}",""`));
  assert.ok(startTemplate.startsWith(`"${handoffId}","${startId}",""`));
});

test("a new loan can be acknowledged for its month without a cutoff ID", () => {
  const result = reviewPayrollReceipts(payload, readReceipt(startAck), []);
  assert.equal(result.state, "ACCEPTED");
  assert.equal(result.acknowledgements[0].receiptId, "PAY-1");
});

test("invalid cents, installment count, existing Payroll source, and renewal month require review", () => {
  for (const [instruction, receipts] of [
    [payload, [{ ...startAck, monthlyAmount: "904.56" }]],
    [payload, [{ ...startAck, remainingInstallments: 17 }]],
    [{ ...payload, start: { ...payload.start, payrollLoanId: 201 } }, [startAck]],
    [renewal, [startAck, { ...stopAck, effectiveMonth: "2026-12" }]],
    [renewal, [startAck, { ...stopAck, payrollLoanId: 200 }]],
  ]) {
    assert.equal(reviewPayrollReceipts(instruction, readReceipt(...receipts), []).state, "NEEDS_REVIEW");
  }
});

test("partial renewal retains its valid receipt and accepts only when the other instruction is confirmed", () => {
  const partial = reviewPayrollReceipts(renewal, readReceipt(startAck), []);
  assert.equal(partial.state, "NEEDS_REVIEW");
  assert.match(partial.reason, /Stop prior deduction/);
  const complete = reviewPayrollReceipts(renewal, readReceipt(stopAck), partial.acknowledgements);
  assert.equal(complete.state, "ACCEPTED");
  assert.equal(complete.acknowledgements.length, 2);
  assert.equal(reviewPayrollReceipts(renewal, readReceipt(startAck), complete.acknowledgements).repeated, true);
});

test("a conflicting receipt cannot replace a confirmed instruction", () => {
  const recorded = reviewPayrollReceipts(renewal, readReceipt(startAck), []).acknowledgements;
  const result = reviewPayrollReceipts(renewal, readReceipt({ ...startAck, receiptId: "OTHER" }, stopAck), recorded);
  assert.equal(result.state, "NEEDS_REVIEW");
  assert.match(result.reason, /conflicts with the recorded acknowledgement/);
  assert.equal(result.acknowledgements[0].receiptId, "PAY-1");
});

test("a retry requires Payroll confirmation for all instructions and zero accepted receipts", () => {
  const unapplied = row => ({ ...row, result: "NOT_APPLIED", reason: "Payroll confirmed this was never applied." });
  assert.equal(reviewPayrollReceipts(renewal, readReceipt(unapplied(startAck), unapplied(stopAck)), []).state, "RETRYABLE");
  assert.equal(reviewPayrollReceipts(renewal, readReceipt(unapplied(startAck)), []).state, "NEEDS_REVIEW");
  for (const rows of [[startAck, unapplied(stopAck)], [unapplied(startAck), { ...stopAck, result: "REJECTED", reason: "Review dates." }]]) {
    assert.equal(reviewPayrollReceipts(renewal, readReceipt(...rows), []).state, "NEEDS_REVIEW");
  }
  const recorded = reviewPayrollReceipts(renewal, readReceipt(startAck), []).acknowledgements;
  assert.equal(reviewPayrollReceipts(renewal, readReceipt(unapplied(startAck), unapplied(stopAck)), recorded).state, "NEEDS_REVIEW");
});

test("a well-formed acknowledgement still requires matching Payroll source records", () => {
  const problem = new Map([[startId, "the Payroll cutoff does not belong to the effective month."]]);
  const result = reviewPayrollReceipts(renewal, readReceipt(startAck, stopAck), [], problem);
  assert.equal(result.state, "NEEDS_REVIEW");
  assert.match(result.reason, /Payroll cutoff/);
  assert.deepEqual(result.acknowledgements.map(ack => ack.instructionId), [stopId]);
});

test("CSV rejects another handoff, duplicate rows, spreadsheet formulas, and incomplete headers", () => {
  assert.throws(() => readReceipt({ ...startAck, handoffId: stopId }), /does not belong/);
  assert.throws(() => readReceipt(startAck, startAck), /repeats an instruction/);
  assert.throws(() => readReceipt({ ...startAck, receiptId: "=2+2" }), /plain text/);
  assert.throws(() => readPayrollReceiptCsv("wrong,columns\n1,2", renewal), /template/);
  assert.match(payrollInstructionCsv({ ...payload, program: "=2+2" }), /"'=2\+2"/);
});

test("legacy acknowledged schedule data remains recognizable without rewriting its original receipts", () => {
  const legacy = { ...payload, start: { ...payload.start, cutoffIds: [82, 85] } };
  const receipt = { ...startAck, cutoffId: 82 };
  const { monthlyAmount, remainingInstallments, ...fields } = receipt;
  const existing = { ...fields, schedule: { remainingInstallments, deductions: [{ cutoffId: 82, amount: "452.27" }, { cutoffId: 85, amount: "452.28" }] } };
  const result = reviewPayrollReceipts(legacy, readReceipt(receipt), [existing]);
  assert.equal(result.state, "ACCEPTED");
  assert.equal(result.repeated, true);
  assert.equal(result.acknowledgements[0], existing);
  assert.equal(monthlyAmount, "904.55");
});
