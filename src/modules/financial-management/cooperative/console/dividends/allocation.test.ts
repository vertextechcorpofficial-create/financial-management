import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateDividendPreview, type DividendPreview } from "./allocation";
import type { DividendBasis, DividendInputs } from "./types";

const draft: DividendInputs = { netSurplus: "48000.00", reservePercent: "10.0000", educationPercent: "10.0000", savingsSharePercent: "70.0000" };
type BasisRow = DividendBasis["rows"][number];

function member(membershipId: number, savingsCentavoDays: bigint, netCashLoanInterest: string, averageSavings = "0.00"): BasisRow {
  return {
    membershipId, employeeId: 100 + membershipId, name: "Member " + membershipId, department: "Finance",
    savingsCentavoDays: String(savingsCentavoDays), averageSavings, netCashLoanInterest,
    patronageEligible: Number(netCashLoanInterest) > 0,
  };
}

function basis(rows: BasisRow[]): DividendBasis {
  return { from: "2024-01-01", through: "2024-12-31", days: 366, provisional: false, rows };
}

function assertBalanced(preview: DividendPreview) {
  const rows = [...preview.credits.values()];
  assert.equal(rows.reduce((total, row) => total + row.savingsCredit, 0n), preview.savings.allocated);
  assert.equal(rows.reduce((total, row) => total + row.patronageRefund, 0n), preview.patronage.allocated);
  for (const pool of [preview.savings, preview.patronage]) {
    assert.equal(pool.allocated + pool.retained, pool.available);
  }
  assert.equal(preview.savings.available + preview.patronage.available, preview.distributable);
  assert.equal(preview.reserve + preview.education + preview.undividedSurplus +
    rows.reduce((total, row) => total + row.total, 0n), preview.netSurplus);
}

test("allocates the prototype pools and derives the effective rate from the posted savings basis", () => {
  const preview = calculateDividendPreview(draft, basis([
    member(1, 366n * 4_000_000n, "50.00", "40000.00"),
    member(2, 366n * 6_000_000n, "150.00", "60000.00"),
  ]));
  assert.deepEqual([preview.reserve, preview.education, preview.distributable], [480_000n, 480_000n, 3_840_000n]);
  assert.equal(preview.savings.available, 2_688_000n);
  assert.equal(preview.patronage.available, 1_152_000n);
  assert.equal(preview.effectiveSavingsRate, "26.88%");
  assert.deepEqual(preview.credits.get(1), { savingsCredit: 1_075_200n, patronageRefund: 288_000n, total: 1_363_200n });
  assertBalanced(preview);
});

test("rounds the distributable and savings balances half up, with exact statutory apportionment", () => {
  const data = basis([]);
  const tiny = { ...draft, netSurplus: "0.01", reservePercent: "50", educationPercent: "0", savingsSharePercent: "50" };
  const half = calculateDividendPreview(tiny, data);
  assert.deepEqual([half.reserve, half.distributable, half.savings.available, half.patronage.available], [0n, 1n, 1n, 0n]);
  const statutoryTie = calculateDividendPreview({ ...tiny, educationPercent: "50" }, data);
  assert.deepEqual([statutoryTie.reserve, statutoryTie.education, statutoryTie.distributable], [1n, 0n, 0n]);
  const greaterEducation = calculateDividendPreview({ ...tiny, netSurplus: "0.03", reservePercent: "10", educationPercent: "30" }, data);
  assert.deepEqual([greaterEducation.reserve, greaterEducation.education, greaterEducation.distributable], [0n, 1n, 2n]);
  const fractionalRates = calculateDividendPreview({ ...tiny, netSurplus: "10000.00", reservePercent: "10.0001", educationPercent: "10.0002" }, data);
  assert.deepEqual([fractionalRates.reserve, fractionalRates.education, fractionalRates.distributable], [100_001n, 100_002n, 799_997n]);
  [half, statutoryTie, greaterEducation, fractionalRates].forEach(assertBalanced);
});

test("breaks tied remainders by numeric membership ID regardless of row order", () => {
  const oneEach = { ...draft, netSurplus: "0.02", reservePercent: "0", educationPercent: "0", savingsSharePercent: "50" };
  const rows = [member(12, 1n, "0.01"), member(2, 1n, "0.01")];
  for (const order of [rows, [...rows].reverse()]) {
    const preview = calculateDividendPreview(oneEach, basis(order));
    assert.deepEqual(preview.credits.get(2), { savingsCredit: 1n, patronageRefund: 1n, total: 2n });
    assert.equal(preview.credits.get(12)?.total, 0n);
    assertBalanced(preview);
  }
});

test("uses unrounded savings and reversal-adjusted interest to award the remaining centavos", () => {
  const input = { ...draft, netSurplus: "0.04", reservePercent: "0", educationPercent: "0", savingsSharePercent: "50" };
  const preview = calculateDividendPreview(input, basis([
    member(9, 100n, "1.00"), member(2, 101n, "0.00"),
    member(4, 102n, "-8.00"), member(5, -1n, "2.00"),
  ]));
  assert.deepEqual([9, 2, 4, 5].map(id => preview.credits.get(id)?.savingsCredit), [0n, 1n, 1n, 0n]);
  assert.deepEqual([9, 2, 4, 5].map(id => preview.credits.get(id)?.patronageRefund), [1n, 0n, 0n, 1n]);
  // All four displayed average balances round to zero. The exact positive basis is 303 centavo-days.
  assert.equal(preview.effectiveSavingsRate, "241.58%");
  assertBalanced(preview);
});

test("retains only the pools without an eligible basis and handles a zero surplus", () => {
  const noBasis = calculateDividendPreview(draft, basis([member(1, 0n, "-2.00")]));
  assert.equal(noBasis.undividedSurplus, 3_840_000n);
  assert.equal(noBasis.effectiveSavingsRate, null);
  const noPatronage = calculateDividendPreview(draft, basis([member(1, 1000n, "0.00")]));
  assert.equal(noPatronage.undividedSurplus, 1_152_000n);
  assert.equal(noPatronage.savings.retained, 0n);
  const noSavings = calculateDividendPreview(draft, basis([member(1, 0n, "10000000000.00")]));
  assert.equal(noSavings.undividedSurplus, 2_688_000n);
  assert.equal(noSavings.patronage.allocated, 1_152_000n);
  const zero = calculateDividendPreview({ ...draft, netSurplus: "0.00" }, basis([member(1, 1n, "1.00")]));
  assert.equal(zero.distributable, 0n);
  assert.equal(zero.effectiveSavingsRate, "0.00%");
  [noBasis, noPatronage, noSavings, zero].forEach(assertBalanced);
});
