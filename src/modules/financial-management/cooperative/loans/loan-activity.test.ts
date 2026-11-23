import assert from "node:assert/strict";
import { test } from "node:test";
import { loanStatementForPeriod, projectLoanLedger, repaymentBusinessDate, type LoanLedger, type LoanMovement } from "./loan-activity";
import {
  passesLoanChecks, payrollHeadroom, payrollOverlap, payrollTermCommitment, salaryLoanRoom,
  type LoanAssessmentCheck, type PayrollCommitment,
} from "./loan-assessment";
import type { Product } from "../policies/policy-types";

const installment = {
  id: 5, no: 1, dueDate: "2026-10-31", principal: "100.00", interest: "10.00", total: "110.00",
  paidTotal: "0.00", paidPrincipal: "0.00", paidInterest: "0.00", penaltyAssessed: "3.00", penaltyPaid: "0.00", status: "UNPAID" as const,
};
const release = { journalId: 8, journalNo: "JV-2026-0008", date: "2026-10-15", postedAt: "2026-10-15T01:23:00" };
const payment: LoanMovement = {
  id: 12, journalId: 9, journalNo: "JV-2026-0009", date: "2026-10-31", postedAt: "2026-10-31T07:00:00",
  kind: "PAYMENT", channel: "OTC", reference: "OR-2026-0001", reversesId: null,
  allocations: [{ installmentId: 5, principal: "19.99", interest: "2.00", penalty: "0.00" }],
};
const offset: LoanMovement = {
  id: 13, journalId: 10, journalNo: "JV-2026-0010", date: "2026-11-15", postedAt: "2026-11-15T06:00:00",
  kind: "OFFSET", channel: "CLEARANCE", reference: "CL-2026-0001", reversesId: null,
  allocations: [{ installmentId: 5, principal: "0.01", interest: "0.00", penalty: "3.00" }],
};
const reversingPayment: LoanMovement = {
  ...payment, id: 14, journalId: 11, journalNo: "JV-2026-0011", date: "2026-12-01", postedAt: "2026-12-01T02:15:00",
  reference: "JV-2026-0011", reversesId: payment.id,
};
const ledger: LoanLedger = { release, installments: [installment], movements: [payment, reversingPayment, offset] };

test("uses today's business date when a receipt predates a posted payment or due-date event", () => {
  const today = "2026-12-10";
  assert.equal(repaymentBusinessDate(ledger, "2026-11-30", today), today);
  assert.equal(repaymentBusinessDate(ledger, "2026-12-01", today), "2026-12-01");
  const beforeDue = { ...ledger, movements: [] };
  assert.equal(repaymentBusinessDate(beforeDue, "2026-10-30", today), "2026-10-30");
  assert.equal(repaymentBusinessDate({ ...beforeDue, installments: [{ ...installment, accrualProcessedOn: today }] }, "2026-10-30", today), today);
  assert.equal(repaymentBusinessDate({ ...beforeDue, installments: [{ ...installment, penaltyAssessedOn: "2026-11-02" }] }, "2026-11-01", today), today);
});

test("includes release and payment on the date boundaries with separate penalties and offsets", () => {
  const statement = loanStatementForPeriod(ledger, "2026-10-15", "2026-11-15");
  assert.deepEqual(statement.totals, {
    opening: "0.00", released: "110.00", paid: "21.99", penaltiesPaid: "3.00", offsets: "0.01", closing: "88.00",
  });
  assert.deepEqual(statement.activity.map(row => [row.kind, row.amount]), [
    ["Release", "110.00"], ["Payment", "21.99"], ["Clearance offset", "3.01"],
  ]);
  const rolling = loanStatementForPeriod(ledger, "2026-11-01", "2026-11-14");
  assert.equal(rolling.totals.opening, "88.01");
  assert.equal(rolling.totals.closing, "88.01");
  assert.deepEqual(rolling.activity, []);
});

test("uses the business date of a later reversal and retains the original in earlier periods", () => {
  assert.equal(projectLoanLedger(ledger, "2026-10-31").pastDue, "0.00");
  assert.equal(projectLoanLedger(ledger, "2026-11-01").pastDue, "88.01");
  assert.equal(projectLoanLedger(ledger, "2026-11-15").principal, "80.00");
  const result = loanStatementForPeriod(ledger, "2026-12-01", "2026-12-01");
  assert.equal(result.totals.opening, "88.00");
  assert.equal(result.totals.paid, "-21.99");
  assert.equal(result.totals.closing, "109.99");
  assert.equal(result.activity[0].reversesJournalNo, payment.journalNo);
  assert.equal(result.activity[0].amount, "-21.99");
});

test("includes a job-assessed penalty only from its assessment date", () => {
  const assessed = { ...ledger, installments: [{ ...installment, penaltyAssessedOn: "2026-11-11" }] };
  assert.equal(projectLoanLedger(assessed, "2026-11-10").penalties, "0.00");
  assert.equal(projectLoanLedger(assessed, "2026-11-11").penalties, "3.00");
  assert.equal(projectLoanLedger(assessed, "2026-11-15").penalties, "0.00");
});

test("orders same-day reversals by posting time even when the reversal journal ID is smaller", () => {
  const corrected = { ...reversingPayment, journalId: 2, date: payment.date, postedAt: "2026-10-31T12:00:00" };
  const asOf = projectLoanLedger({ ...ledger, movements: [corrected, payment] }, payment.date);
  assert.equal(asOf.remaining, "110.00");
  assert.equal(asOf.installments[0].status, "UNPAID");
});

test("counts a payoff only when the installment and assessed penalty are settled", () => {
  const payoff: LoanMovement = {
    ...payment, id: 15, journalId: 16, date: "2026-12-02", postedAt: "2026-12-02T07:00:00",
    allocations: [{ installmentId: 5, principal: "99.99", interest: "10.00", penalty: "0.00" }],
  };
  const settled = projectLoanLedger({ ...ledger, movements: [...ledger.movements, payoff] }, payoff.date);
  assert.equal(settled.remaining, "0.00");
  assert.equal(settled.penalties, "0.00");
  assert.equal(settled.fullyPaid, true);
  assert.throws(() => projectLoanLedger({ ...ledger, movements: [reversingPayment] }, reversingPayment.date), /original posting/);
  assert.throws(() => projectLoanLedger({ ...ledger, movements: [{ ...payment, allocations: [{ ...payment.allocations[0], installmentId: 99 }] }] }, payment.date), /schedule/);
});

const savings: PayrollCommitment = { table: "cooperative_memberships", id: 12, cents: 20_000n };
const loan: PayrollCommitment = { table: "cooperative_loans", id: 11, cents: 30_000n };
const deduction = (source_table: string, source_id: number, amount: string) => ({
  source_table, source_id, amount, item_key: source_table + ":" + source_id,
});

test("a failed tenure warning allows the loan action while a failed payroll check blocks it", () => {
  const tenure: LoanAssessmentCheck = { key: "tenure", label: "Membership tenure", detail: "Product minimum is 3 months.", ok: false, severity: "warning" };
  const payroll = { key: "payroll", label: "Take-home pay", detail: "Verified payroll cutoff.", ok: true };

  assert.equal(passesLoanChecks([tenure, payroll]), true);
  assert.equal(passesLoanChecks([{ ...tenure, ok: true, severity: undefined }, payroll]), true);
  assert.equal(passesLoanChecks([tenure, { ...payroll, ok: false }]), false);
});

test("credits a verified partial withholding and keeps unrelated employee-loan deductions in net pay", () => {
  const posted = {
    coop_savings: "200.00", coop_loan: "120.01",
    breakdown_json: { deductions: {
      coop_savings_items: [deduction(savings.table, savings.id, "200.00")],
      coop_loan_items: [deduction(loan.table, loan.id, "120.01")],
      employee_loan_items: [deduction("employee_loan", loan.id, "100.00")],
    } },
  };
  const overlap = payrollOverlap(posted, [savings, loan]);
  assert.equal(overlap, 32_001n);
  assert.deepEqual(payrollHeadroom("6700.00", 500_000n, [savings, loan], overlap!), {
    payrollDeduction: "500.00", includedInNetPay: "320.01", headroom: "1520.01",
  });
});

test("caps withholding overlap at the commitment and rejects ambiguous or conflicting deductions", () => {
  const full = { coop_savings: "250.00", coop_loan: "0.00", breakdown_json: { deductions: {
    coop_savings_items: [deduction(savings.table, savings.id, "250.00")],
  } } };
  assert.equal(payrollOverlap(full, [savings, loan]), 20_000n);
  assert.equal(payrollOverlap({
    ...full, breakdown_json: { deductions: { coop_savings_items: [deduction("other", savings.id, "250.00")] } },
  }, [savings]), null);
  assert.equal(payrollOverlap({ ...full, coop_savings: "200.00" }, [savings]), null);
  assert.equal(payrollOverlap({ ...full, breakdown_json: "{" }, [savings]), null);
  assert.equal(payrollOverlap({ ...full, coop_savings: "0.00", breakdown_json: null }, [savings]), 0n);
});

test("uses actual repayment frequency and the remaining first applicable installment", () => {
  assert.equal(payrollTermCommitment("MONTHLY", "2028-02-15", [], "25.00"), 0n);
  assert.equal(payrollTermCommitment("MONTHLY", "2028-02-29", [], "25.00"), 2500n);
  assert.equal(payrollTermCommitment("CUTOFF", "2028-02-15", [], "25.00"), 2500n);
  assert.equal(payrollTermCommitment("CUTOFF", "2028-02-15", [{ ...installment, dueDate: "2028-02-15", paidTotal: "0.01" }], null), 10999n);
  assert.equal(payrollTermCommitment("CUTOFF", "2028-02-15", [{ ...installment, dueDate: "2028-02-29" }], null), 0n);
});

test("uses the configured salary multiple and clips remaining principal room at zero", () => {
  const product = { isOpen: true, limitType: "SAVINGS_MULTIPLE", savingsMultiple: "2.5000" } as Product;
  assert.deepEqual(salaryLoanRoom(product, "1000.01", 20_000n), { state: "ready", amount: "2300.03" });
  assert.deepEqual(salaryLoanRoom(product, "1.00", 2501n), { state: "ready", amount: "0.00" });
  assert.deepEqual(salaryLoanRoom({ ...product, limitType: "NONE" }, "1000.01", 0n), { state: "unlimited" });
  assert.equal(salaryLoanRoom({ ...product, isOpen: false }, "1000.01", 0n).state, "unavailable");
});
