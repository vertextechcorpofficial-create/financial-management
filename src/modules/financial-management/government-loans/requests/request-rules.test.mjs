import assert from "node:assert/strict";
import test from "node:test";
import { excludesRequestFolder } from "./document-privacy.ts";
import { canCancelRequest, changeRequestField, requestCapacity, requiredFields } from "./request-rules.ts";
import { emptyRequest, requestStatusLabels } from "./types.ts";

const government = {
  id: 24, shortCode: "SSS", name: "SSS", agencyType: "GOVERNMENT",
  programs: ["Salary Loan"], payoutOptions: ["Cash card"],
};
const bank = { ...government, id: 26, shortCode: "BANK", agencyType: "BANK" };
const complete = {
  ...emptyRequest, employeeId: 1, agencyId: government.id, program: "Salary Loan", applicationType: "NEW",
  amount: "24000.00", term: "24", payout: "Cash card", deductionConsent: true, dataSharingConsent: true,
};
const checks = { employeeActive: true, agency: government, coMakerActive: false, renewalValid: false };
const previous = { id: 4, agencyCode: "SSS", program: "Salary Loan", reference: null, amortization: "1000.00", paid: 2, installments: 12 };
const other = { ...previous, id: 5, agencyCode: "HDMF", amortization: "2000.00" };

test("draft fields start blank and complete government requests pass the required-field checks", () => {
  const errors = requiredFields(emptyRequest, { ...checks, agency: null, employeeActive: false });
  assert.deepEqual(Object.keys(errors).sort(), [
    "agencyId", "amount", "applicationType", "dataSharingConsent", "deductionConsent", "employeeId", "program", "term",
  ]);
  assert.deepEqual(requiredFields(complete, checks), {});
  const invalid = requiredFields({ ...complete, amount: "0", term: "2.5", dataSharingConsent: false }, checks);
  assert.deepEqual(Object.keys(invalid), ["amount", "term", "dataSharingConsent"]);
});

test("bank renewals require a different active co-maker and a verified renewal loan", () => {
  const form = { ...complete, agencyId: bank.id, applicationType: "RENEWAL", coMakerId: complete.employeeId };
  const actual = requiredFields(form, { ...checks, agency: bank, coMakerActive: true });
  assert.deepEqual(Object.keys(actual), ["renewalLoanId", "coMakerId"]);
  assert.deepEqual(requiredFields({ ...form, coMakerId: 2, renewalLoanId: previous.id }, {
    ...checks, agency: bank, coMakerActive: true, renewalValid: true,
  }), {});
});

test("agency changes clear dependent selections and consent while preserving entered terms", () => {
  const result = changeRequestField({
    ...complete, agencyId: bank.id, renewalLoanId: previous.id, coMakerId: 2, coMakerRelationship: "Co-worker",
    agencyReference: "OLD", agencyFiledOn: "2026-10-01", agencyAmortization: "1000.00",
  }, "agencyId", government.id);
  assert.equal(result.program, "");
  assert.equal(result.payout, "");
  assert.equal(result.renewalLoanId, null);
  assert.equal(result.coMakerId, null);
  assert.equal(result.coMakerRelationship, "");
  assert.equal(result.agencyReference, "");
  assert.equal(result.agencyFiledOn, "");
  assert.equal(result.agencyAmortization, "");
  assert.equal(result.dataSharingConsent, false);
  assert.equal(result.deductionConsent, true);
  assert.equal(result.amount, complete.amount);
  assert.equal(result.term, complete.term);
});

test("the capacity comparison uses exact centavos at 40%, with round-half-up estimates", () => {
  const loans = [previous, other];
  const exact = requestCapacity(complete, "10000.00", loans, true);
  assert.equal(exact.estimatedAmortization, "1000.00");
  assert.equal(exact.deductionPercent, "40.00");
  assert.equal(exact.aboveGuide, false);
  const override = requestCapacity({ ...complete, agencyAmortization: "1000.01" }, "10000.00", loans, true);
  assert.equal(override.estimatedAmortization, "1000.01");
  assert.equal(override.agencyEstimate, true);
  assert.equal(override.aboveGuide, true);
  assert.equal(requestCapacity({ ...complete, amount: "1.01", term: "2" }, "10000.00", loans, true).estimatedAmortization, "0.51");
});

test("only the selected renewal is excluded, and unverified deductions stay unavailable", () => {
  const form = { ...complete, applicationType: "RENEWAL", renewalLoanId: previous.id };
  const capacity = requestCapacity(form, "10000.00", [previous, other], true);
  assert.deepEqual(capacity.existingLoans.map(loan => loan.id), [other.id]);
  assert.equal(capacity.existingTotal, "2000.00");
  assert.equal(capacity.deductionPercent, "30.00");
  const unknown = requestCapacity(form, "10000.00", [previous, other], false);
  assert.equal(unknown.existingTotal, null);
  assert.equal(unknown.deductionPercent, null);
  assert.equal(unknown.aboveGuide, null);
});

test("private folder checks require every branch of an OR to exclude the target folder", () => {
  const id = "private";
  const excluded = { _or: [{ folder: { _null: true } }, { folder: { _neq: id } }] };
  assert.equal(excludesRequestFolder(excluded, id), true);
  assert.equal(excludesRequestFolder({ _and: [{ another_rule: {} }, excluded] }, id), true);
  assert.equal(excludesRequestFolder({ _or: [excluded, { folder: { _in: [id] } }] }, id), false);
  assert.equal(excludesRequestFolder({}, id), false);
});

test("cancellation is available only for requested or approved requests", () => {
  assert.deepEqual(Object.keys(requestStatusLabels).filter(canCancelRequest), ["REQUESTED", "APPROVED"]);
});
