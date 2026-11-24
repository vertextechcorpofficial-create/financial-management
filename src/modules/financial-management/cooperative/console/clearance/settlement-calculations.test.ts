import assert from "node:assert/strict";
import { test } from "node:test";
import { projectLoanLedger, type LoanLedger, type LoanMovement } from "../../loans/loan-activity";
import { amountToCents, centsToAmount, type LoanInstallment } from "../../loans/loan-schedule";
import { exitSavingsRatesSchema } from "../../policies/policy-types";
import { calculateSettlement, type SettlementLoan } from "./settlement-calculations";

const installment = (no: number, dueDate: string, principal: string, interest = "0.00"): LoanInstallment => ({
  no, dueDate, principal, interest, total: centsToAmount(amountToCents(principal) + amountToCents(interest)),
  penaltyAssessed: "0.00", paidTotal: "0.00", paidPrincipal: "0.00", paidInterest: "0.00", penaltyPaid: "0.00", status: "UNPAID",
});

const loan = (id: number, installments: LoanInstallment[], kind: SettlementLoan["kind"] = "CASH",
  releasedOn = "2026-04-30"): SettlementLoan => ({ id, reference: `Loan ${id}`, kind, releasedOn, installments });

const standard = {
  separationDate: "2026-06-15", annualRate: "12", savings: "1000.00", finalPay: "200.00", penaltiesFirst: true,
};

test("allocates savings and then final pay to the oldest installments across loans", () => {
  const loans = [
    loan(1, [installment(1, "2026-05-31", "600.00"), installment(2, "2026-06-30", "300.00")]),
    loan(2, [installment(1, "2026-06-15", "600.00")]),
  ];
  const preview = calculateSettlement({ ...standard, loans });
  assert.equal(preview.dividend, "55.00");
  assert.equal(preview.debt, "1500.00");
  assert.deepEqual(preview.funding, {
    available: "1055.00", savingsApplied: "1055.00", finalPayApplied: "200.00",
    remainingAfterSavings: "445.00", remaining: "245.00", refund: "0.00",
  });
  assert.deepEqual(preview.loans.map(row => [row.id, row.savingsApplied, row.finalPayApplied, row.recovered, row.remaining]), [
    [1, "600.00", "55.00", "655.00", "245.00"], [2, "455.00", "145.00", "600.00", "0.00"],
  ]);
});

test("refunds excess savings and caps final pay at the shortfall", () => {
  const debt = (principal: string) => [loan(1, [installment(1, "2026-05-31", principal)])];
  const refund = calculateSettlement({ ...standard, loans: debt("900.00"), finalPay: null });
  assert.equal(refund.funding?.refund, "155.00");
  assert.equal(refund.funding?.remaining, "0.00");
  assert.equal(refund.funding?.finalPayApplied, "0.00");
  const exact = calculateSettlement({ ...standard, loans: debt("1055.00") });
  assert.equal(exact.funding?.refund, "0.00");
  assert.equal(exact.funding?.finalPayApplied, "0.00");
  const capped = calculateSettlement({ ...standard, loans: debt("1100.00") });
  assert.equal(capped.funding?.finalPayApplied, "45.00");
  assert.equal(capped.funding?.remaining, "0.00");
});

test("distinguishes pending final pay and annual rates from verified zero values", () => {
  const input = { ...standard, loans: [loan(1, [installment(1, "2026-05-31", "1500.00")])], finalPay: null };
  const pending = calculateSettlement(input);
  assert.equal(pending.funding?.remainingAfterSavings, "445.00");
  assert.equal(pending.funding?.finalPayApplied, null);
  assert.equal(pending.funding?.remaining, null);
  assert.equal(pending.loans[0].remainingAfterSavings, "445.00");
  const zero = calculateSettlement({ ...input, annualRate: "0", finalPay: "0.00" });
  assert.equal(zero.dividend, "0.00");
  assert.equal(zero.funding?.remaining, "500.00");
  assert.equal(zero.funding?.finalPayApplied, "0.00");
  const missing = calculateSettlement({ ...input, annualRate: null });
  assert.equal(missing.debt, "1500.00");
  assert.equal(missing.dividend, null);
  assert.equal(missing.funding, null);
});

test("prorates with 30-day months, caps December 31, and rounds half up", () => {
  const input = { ...standard, loans: [], savings: "1000.10" };
  assert.equal(calculateSettlement(input).dividend, "55.01");
  assert.equal(calculateSettlement({ ...input, separationDate: "2026-12-31" }).dividend, "120.01");
  assert.equal(calculateSettlement({ ...input, separationDate: "2028-02-29" }).elapsed, 59);
});

test("uses posted allocations and dated penalties and caps partially prepaid interest at the amount earned", () => {
  const movement = (id: number, date: string, allocations: LoanMovement["allocations"], reversesId: number | null = null): LoanMovement => ({
    id, date, allocations, reversesId, journalId: id, journalNo: `Journal ${id}`, postedAt: date + "T05:00:00",
    kind: "PAYMENT", channel: "OTC", reference: `Receipt ${id}`,
  });
  const original = [{ installmentId: 1, principal: "40.00", interest: "4.00", penalty: "3.00" }];
  const ledger: LoanLedger = {
    release: { journalId: 100, journalNo: "Release", date: "2026-04-30", postedAt: "2026-04-30T05:00:00" },
    installments: [
      { ...installment(1, "2026-05-31", "100.00", "10.00"), id: 1, penaltyAssessed: "8.00", penaltyAssessedOn: "2026-06-04" },
      { ...installment(2, "2026-06-30", "100.00", "12.00"), id: 2, penaltyAssessed: "7.00", penaltyAssessedOn: "2026-07-05" },
      { ...installment(3, "2026-07-31", "100.00", "16.00"), id: 3 },
    ],
    movements: [
      movement(2, "2026-06-10", original),
      movement(3, "2026-06-15", [{ installmentId: 2, principal: "20.00", interest: "4.00", penalty: "0.00" }]),
      movement(4, "2026-06-16", original, 2),
    ],
  };
  const preview = (date: string) => calculateSettlement({
    ...standard, separationDate: date, loans: [loan(1, projectLoanLedger(ledger, date).installments)],
  }).loans[0];
  const asOf = preview("2026-06-15");
  assert.deepEqual([asOf.principal, asOf.dueInterest, asOf.accruedInterest, asOf.penalties, asOf.debt],
    ["240.00", "6.00", "2.00", "5.00", "253.00"]);
  assert.equal(preview("2026-06-16").debt, "300.40");
  assert.equal(preview("2026-07-04").penalties, "8.00");
  assert.equal(preview("2026-07-05").penalties, "15.00");
});

test("includes unpaid goods markup, skips later releases and breaks equal due dates by release date then loan ID", () => {
  const goods = loan(3, [
    { ...installment(1, "2026-06-30", "100.00", "20.00"), paidPrincipal: "10.00", paidInterest: "2.00", paidTotal: "12.00", status: "PARTIAL" },
    installment(2, "2026-07-31", "100.00", "20.00"),
  ], "GOODS");
  const future = loan(4, [installment(1, "2026-07-31", "100.00")], "CASH", "2026-06-16");
  const equal = installment(1, "2026-06-30", "100.00");
  const loans = [goods, future, loan(2, [equal]), loan(1, [equal]), loan(7, [equal], "CASH", "2026-04-29")];
  const preview = calculateSettlement({ ...standard, loans, savings: "125.00", annualRate: "0", finalPay: "0.00" });
  assert.deepEqual(preview.loans.map(row => [row.id, row.savingsApplied]), [[7, "100.00"], [1, "25.00"], [2, "0.00"], [3, "0.00"]]);
  assert.equal(preview.loans.at(-1)?.goodsInstallments, "228.00");
});

test("validates approved annual savings rates by calendar year", () => {
  assert.deepEqual(exitSavingsRatesSchema.parse({ "2026": "0", "2027": "12.123456" }),
    { "2026": "0.000000", "2027": "12.123456" });
  for (const rates of [{ "26": "12" }, { "2026": "100.01" }, { "2026": "-1" }, { "2026": "0.0000001" }]) {
    assert.equal(exitSavingsRatesSchema.safeParse(rates).success, false);
  }
});

test("keeps the funding allocations and unearned interest available for the posting transaction", () => {
  const input = { ...standard, savings: "100.00", annualRate: "0", finalPay: "50.00", loans: [
    loan(1, [installment(1, "2026-05-31", "100.00"), installment(2, "2026-06-30", "100.00", "30.00")]),
  ] };
  const result = calculateSettlement(input);
  assert.deepEqual(result.allocations, [
    { source: "SAVINGS", loanId: 1, installmentNo: 1, principal: "100.00", interest: "0.00", penalty: "0.00", total: "100.00" },
    { source: "FINAL_PAY", loanId: 1, installmentNo: 2, principal: "43.48", interest: "6.52", penalty: "0.00", total: "50.00" },
  ]);
  assert.deepEqual(result.interestWaivers, [{ loanId: 1, installmentNo: 2, amount: "15.00" }]);
  assert.equal(result.funding?.remaining, "65.00");
});
