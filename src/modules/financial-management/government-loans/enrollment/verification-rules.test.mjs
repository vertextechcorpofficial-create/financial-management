import assert from "node:assert/strict";
import test from "node:test";
import {
  canStartInOpenPeriod, isEnrollmentPreparer, needsImportTransferChoice, requiredEnrollmentEvidence,
} from "./verification-rules.ts";

const saved = { origin: "REQUEST", installmentsPaid: 0, priorLoanId: null };
const baseDocuments = ["AUTHORITY", "AGENCY_APPROVAL"];
const statement = [...baseDocuments, "STATEMENT_OF_ACCOUNT"];

test("authority and agency approval are needed for an ordinary enrollment", () => {
  assert.deepEqual(requiredEnrollmentEvidence(saved, false), baseDocuments);
});

test("renewals, transfers, and loans with paid installments require a statement of account", () => {
  assert.deepEqual(requiredEnrollmentEvidence(saved, true), statement);
  assert.deepEqual(requiredEnrollmentEvidence({ ...saved, priorLoanId: 4 }, false), statement);
  assert.deepEqual(requiredEnrollmentEvidence({ ...saved, origin: "TRANSFER" }, false), statement);
  assert.deepEqual(requiredEnrollmentEvidence({ ...saved, installmentsPaid: 1 }, false), statement);
});

test("staff must classify zero-paid imports explicitly", () => {
  const imported = { ...saved, origin: "IMPORT" };
  assert.equal(needsImportTransferChoice(imported), true);
  assert.equal(needsImportTransferChoice({ ...imported, installmentsPaid: 1 }), false);
  for (const transfer of [false, true]) {
    const classified = { ...imported, importTransfer: transfer };
    assert.equal(needsImportTransferChoice(classified), false);
    assert.deepEqual(requiredEnrollmentEvidence(classified, false), transfer ? statement : baseDocuments);
  }
  assert.equal(needsImportTransferChoice(saved), false);
});

test("neither the original encoder nor the current resubmitter can decide", () => {
  const enrollment = { encodedBy: { id: 1 }, resubmittedBy: { id: 9 } };
  assert.equal(isEnrollmentPreparer(enrollment, 1), true);
  assert.equal(isEnrollmentPreparer(enrollment, 9), true);
  assert.equal(isEnrollmentPreparer(enrollment, 2), false);
});

test("verification permits the open month or later and rejects missing or closed months", () => {
  assert.equal(canStartInOpenPeriod("2026-12", "2026-12"), true);
  assert.equal(canStartInOpenPeriod("2027-04", "2026-12"), true);
  assert.equal(canStartInOpenPeriod("2026-11", "2026-12"), false);
  assert.equal(canStartInOpenPeriod("2026-13", "2026-12"), false);
  assert.equal(canStartInOpenPeriod("2027-01", null), false);
});
