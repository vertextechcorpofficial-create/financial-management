import { amountToCents, centsToAmount, divideRoundHalfUp, percentMicros } from "../../loans/loan-schedule";
import type { DividendBasis, DividendInputs, DividendPostingPreview } from "./types";

const percentDivisor = 100_000_000n;
type Share = { id: number; numerator: bigint };
type Pool = { available: bigint; allocated: bigint; retained: bigint };

function apportion(total: bigint, shares: Share[], denominator: bigint) {
  const quotients = shares.map(({ id, numerator }) => ({
    id, cents: numerator / denominator, remainder: numerator % denominator,
  }));
  const leftover = total - quotients.reduce((sum, share) => sum + share.cents, 0n);
  quotients.sort((left, right) => {
    if (left.remainder === right.remainder) return left.id - right.id;
    return left.remainder > right.remainder ? -1 : 1;
  });
  return new Map(quotients.map(({ id, cents }, index) => [id, cents + (BigInt(index) < leftover ? 1n : 0n)]));
}

function allocatePool(available: bigint, weights: { id: number; weight: bigint }[]) {
  const eligible = weights.filter(row => row.weight > 0n);
  const totalWeight = eligible.reduce((sum, row) => sum + row.weight, 0n);
  const allocated = totalWeight > 0n ? available : 0n;
  const pool: Pool = { available, allocated, retained: available - allocated };
  const credits = totalWeight > 0n
    ? apportion(allocated, eligible.map(({ id, weight }) => ({ id, numerator: allocated * weight })), totalWeight)
    : new Map<number, bigint>();
  return { pool, credits, totalWeight };
}

export function calculateDividendPreview(inputs: DividendInputs, basis: DividendBasis) {
  const netSurplus = amountToCents(inputs.netSurplus);
  const reserveRate = percentMicros(inputs.reservePercent);
  const educationRate = percentMicros(inputs.educationPercent);
  const distributable = divideRoundHalfUp(netSurplus * (percentDivisor - reserveRate - educationRate), percentDivisor);
  // Award any statutory rounding centavo to the largest remainder, with reserve first on a tie.
  const statutory = apportion(netSurplus - distributable, [
    { id: 0, numerator: netSurplus * reserveRate },
    { id: 1, numerator: netSurplus * educationRate },
  ], percentDivisor);

  const savingsAvailable = divideRoundHalfUp(distributable * percentMicros(inputs.savingsSharePercent), percentDivisor);
  const savings = allocatePool(savingsAvailable, basis.rows.map(row => ({
    id: row.membershipId, weight: BigInt(row.savingsCentavoDays),
  })));
  const patronage = allocatePool(distributable - savingsAvailable, basis.rows.map(row => ({
    // The posted basis supplies a signed, fixed two-decimal amount.
    id: row.membershipId, weight: BigInt(row.netCashLoanInterest.replace(".", "")),
  })));

  const rate = savings.totalWeight > 0n
    ? divideRoundHalfUp(savingsAvailable * BigInt(basis.days) * 10_000n, savings.totalWeight)
    : null;
  const credits = new Map(basis.rows.map(({ membershipId }) => {
    const savingsCredit = savings.credits.get(membershipId) ?? 0n;
    const patronageRefund = patronage.credits.get(membershipId) ?? 0n;
    return [membershipId, { savingsCredit, patronageRefund, total: savingsCredit + patronageRefund }];
  }));

  return {
    netSurplus, reserve: statutory.get(0)!, education: statutory.get(1)!, distributable,
    savings: savings.pool, patronage: patronage.pool,
    undividedSurplus: savings.pool.retained + patronage.pool.retained,
    effectiveSavingsRate: rate === null ? null : `${rate / 100n}.${String(rate % 100n).padStart(2, "0")}%`,
    credits,
  };
}

export type DividendPreview = ReturnType<typeof calculateDividendPreview>;

type SavedAllocation = DividendPostingPreview["allocation"];

export function saveDividendAllocation(preview: DividendPreview): SavedAllocation {
  const { credits, savings, patronage, effectiveSavingsRate, ...totals } = preview;
  const formatPool = (pool: Pool) => ({
    available: centsToAmount(pool.available), allocated: centsToAmount(pool.allocated), retained: centsToAmount(pool.retained),
  });
  return {
    netSurplus: centsToAmount(totals.netSurplus), reserve: centsToAmount(totals.reserve),
    education: centsToAmount(totals.education), distributable: centsToAmount(totals.distributable),
    undividedSurplus: centsToAmount(totals.undividedSurplus),
    savings: formatPool(savings), patronage: formatPool(patronage), effectiveSavingsRate,
    credits: [...credits].map(([membershipId, row]) => ({
      membershipId, savingsCredit: centsToAmount(row.savingsCredit), patronageRefund: centsToAmount(row.patronageRefund),
      total: centsToAmount(row.total),
    })),
  };
}

export function readDividendAllocation(saved: SavedAllocation): DividendPreview {
  const pool = (values: SavedAllocation["savings"]): Pool => ({
    available: amountToCents(values.available), allocated: amountToCents(values.allocated), retained: amountToCents(values.retained),
  });
  return {
    netSurplus: amountToCents(saved.netSurplus), reserve: amountToCents(saved.reserve),
    education: amountToCents(saved.education), distributable: amountToCents(saved.distributable),
    undividedSurplus: amountToCents(saved.undividedSurplus), effectiveSavingsRate: saved.effectiveSavingsRate,
    savings: pool(saved.savings), patronage: pool(saved.patronage),
    credits: new Map(saved.credits.map(row => [row.membershipId, {
      savingsCredit: amountToCents(row.savingsCredit), patronageRefund: amountToCents(row.patronageRefund), total: amountToCents(row.total),
    }])),
  };
}
