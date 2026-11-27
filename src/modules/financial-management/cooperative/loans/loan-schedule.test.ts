import assert from "node:assert/strict";
import { test } from "node:test";
import { createLoanTermsSnapshot } from "../policies/loan-terms";
import type { Product } from "../policies/policy-types";
import {
  allocatePayment,
  amountToCents,
  buildLoanSchedule,
  loanDueDates,
  loanTotals,
  nextCutoffDate,
  nextMonthEndDate,
  penaltyAmount,
  type LoanInstallment,
} from "./loan-schedule";

test("matches the specification's salary-loan example", () => {
  const schedule = buildLoanSchedule({
    principal: "20000.00",
    rate: "1.250000",
    method: "DIMINISHING",
    months: 12,
    frequency: "CUTOFF",
    releaseDate: "2026-11-15",
  });
  assert.equal(schedule.installments.length, 24);
  assert.equal(schedule.regularPayment, "899.99");
  assert.equal(schedule.finalPayment, "900.05");
  assert.equal(schedule.installments[0].dueDate, "2026-11-30");
  assert.equal(schedule.installments.at(-1)?.dueDate, "2027-11-15");
  assert.equal(
    schedule.installments.reduce((sum, row) => sum + amountToCents(row.principal), 0n),
    amountToCents("20000.00"),
  );
});

test("generates cutoff and monthly due dates after release", () => {
  assert.equal(nextCutoffDate("2026-11-15"), "2026-11-30");
  assert.equal(nextCutoffDate("2026-11-30"), "2026-12-15");
  assert.equal(nextMonthEndDate("2026-11-15"), "2026-11-30");
  assert.equal(nextMonthEndDate("2026-11-30"), "2026-12-31");
  assert.equal(nextMonthEndDate("2028-01-31"), "2028-02-29");
  assert.equal(nextMonthEndDate("2028-02-29"), "2028-03-31");
  assert.deepEqual(loanDueDates("2028-01-31", 2, "MONTHLY"), ["2028-02-29", "2028-03-31"]);
});

test("prices goods from invoice value plus markup", () => {
  const schedule = buildLoanSchedule({
    principal: "19100.00",
    rate: "0",
    markup: "10.000000",
    method: "MARKUP",
    months: 6,
    frequency: "CUTOFF",
    releaseDate: "2026-11-20",
  });
  assert.equal(schedule.installments.length, 12);
  assert.equal(schedule.totalPayable, "21010.00");
  assert.equal(
    schedule.installments.reduce((sum, row) => sum + amountToCents(row.principal), 0n),
    amountToCents("19100.00"),
  );
});

test("captures goods price, quantity, and required documents in the signed terms", () => {
  const product: Product = {
    id: 1, code: "AP", name: "Appliance", shortName: "Appliance", prefix: "AP", description: "", isOpen: true,
    kind: "GOODS", items: [{ id: 2, name: "Refrigerator", price: "19100.00" }], markup: "10.000000",
    rateMin: null, rateDefault: null, rateMax: null, methods: ["markup"], termsMonths: [6], frequencies: ["cutoff"], modes: ["otc"],
    limitType: "NONE", savingsMultiple: null, fixedCeiling: null, minimumMembershipMonths: 0, penaltyPercent: "2.000000",
    graceDays: 10, processingFee: "50.00", documentRules: [{ documentTypeId: 3, enforcement: "BLOCK" }],
  };
  const docTypes = [{ id: 3, code: "VENDOR_QUOTE", name: "Vendor quotation", isActive: true }];
  const selection = { itemId: 2, quantity: 2, term: 6, method: "markup", frequency: "cutoff", mode: "otc" } as const;
  const snapshot = createLoanTermsSnapshot(product, docTypes, 7, selection);
  product.items[0].price = "19900.00";
  product.documentRules[0].enforcement = "WARN";
  assert.equal(snapshot.principal, "38200.00");
  assert.deepEqual(snapshot.item, { id: 2, name: "Refrigerator", price: "19100.00", quantity: 2 });
  assert.equal(snapshot.documents[0].enforcement, "BLOCK");
  assert.throws(() => createLoanTermsSnapshot(product, docTypes, 7, { ...selection, quantity: 11 }), /quantity/);
  assert.throws(() => createLoanTermsSnapshot(product, docTypes, 7, { ...selection, itemId: undefined }), /item/);
});

test("allocates partial payments proportionally and penalties first", () => {
  const installment: LoanInstallment = {
    no: 1,
    dueDate: "2026-11-30",
    principal: "100.00",
    interest: "25.00",
    total: "125.00",
    paidTotal: "0.00",
    paidPrincipal: "0.00",
    paidInterest: "0.00",
    penaltyAssessed: "10.00",
    penaltyPaid: "0.00",
    status: "UNPAID",
  };
  const result = allocatePayment([installment], "50.00", true);
  assert.deepEqual(result.allocations, [{
    installmentNo: 1,
    principal: "32.00",
    interest: "8.00",
    penalty: "10.00",
    total: "50.00",
  }]);
  assert.equal(result.schedule[0].paidTotal, "40.00");
  assert.equal(result.schedule[0].paidPrincipal, "32.00");
  assert.equal(result.schedule[0].paidInterest, "8.00");
  assert.equal(result.schedule[0].penaltyPaid, "10.00");
  assert.equal(result.schedule[0].status, "PARTIAL");
  assert.equal(result.remainder, "0.00");
});

test("marks fully paid only after installments and penalties settle", () => {
  const base: LoanInstallment = {
    no: 1,
    dueDate: "2026-11-30",
    principal: "100.00",
    interest: "25.00",
    total: "125.00",
    paidTotal: "125.00",
    paidPrincipal: "100.00",
    paidInterest: "25.00",
    penaltyAssessed: "10.00",
    penaltyPaid: "0.00",
    status: "PAID",
  };
  const before = loanTotals([base], "2026-12-10");
  assert.equal(before.fullyPaid, false);
  assert.equal(before.penalties, "10.00");
  const paid = { ...base, penaltyPaid: "10.00" };
  const after = loanTotals([paid], "2026-12-10");
  assert.equal(after.fullyPaid, true);
  assert.equal(penaltyAmount("125.00", "2.000000"), "2.50");
});
