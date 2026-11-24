import assert from "node:assert/strict";
import { test } from "node:test";
import { deductionMonths, exactMoney, normalizedReference, unusualReference } from "./rules.ts";

test("the open month and next three calendar months cross the year boundary", () => {
  assert.deepEqual(deductionMonths("2026-11"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(deductionMonths("2026-12"), ["2026-12", "2027-01", "2027-02", "2027-03"]);
  for (const invalid of [null, "2026-00", "2026-13", "2026-1", "0000-12", "9999-10"]) {
    assert.deepEqual(deductionMonths(invalid), []);
  }
});

test("the agency patterns flag unusual references and duplicates use a separate comparison key", () => {
  const examples = [
    ["SSS", "SL-0426-207714"],
    ["HDMF", "MPL-1226-0045871"],
    ["PAGIBIG", "CAL-1026-0002222"],
    ["BANK", "PB-SL-77120433"],
  ];
  for (const [code, reference] of examples) {
    assert.equal(unusualReference(code, " " + reference + " "), false);
    assert.equal(unusualReference(code, reference + "9"), true);
    assert.equal(normalizedReference(" " + reference.toLowerCase() + " "), reference);
  }
  assert.equal(unusualReference("CUSTOM", "Printed on employer notice"), false);
  assert.equal(unusualReference("SSS", ""), false);
});

test("exact amounts retain centavos without calculating the amortization", () => {
  assert.equal(exactMoney("0012345.67"), "12345.67");
  assert.equal(exactMoney("580.7"), "580.70");
  assert.equal(exactMoney("9999999999.99"), "9999999999.99");
  assert.equal(exactMoney("20000"), "20000.00");
});
