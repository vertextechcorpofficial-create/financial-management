import { calculateLoanExample } from "../policies/loan-terms";

export type LoanFrequency = "CUTOFF" | "MONTHLY";
export type LoanMethod = "DIMINISHING" | "FLAT" | "MARKUP" | "UPFRONT";
export type InstallmentStatus = "UNPAID" | "PARTIAL" | "PAID";

export type LoanInstallment = {
  no: number;
  dueDate: string;
  principal: string;
  interest: string;
  total: string;
  paidTotal: string;
  paidPrincipal: string;
  paidInterest: string;
  penaltyAssessed: string;
  penaltyAssessedOn?: string | null;
  accrualProcessedOn?: string | null;
  accrualJournalId?: number | null;
  settlementWaiver?: { amount: string; date: string; reference: string; reversedOn: string | null } | null;
  penaltyPaid: string;
  status: InstallmentStatus;
};

export type PaymentAllocation = {
  installmentNo: number;
  principal: string;
  interest: string;
  penalty: string;
  total: string;
};

const DAY_MS = 86_400_000;
const MAX_CENTS = 999_999_999_999n;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Choose a valid date.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Choose a valid date.");
  }
  return { year, month, day };
}

export function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function nextCutoffDate(value: string) {
  const { year, month, day } = parseDate(value);
  const last = lastDayOfMonth(year, month);
  if (day < 15) return `${year}-${pad(month)}-15`;
  if (day < last) return `${year}-${pad(month)}-${pad(last)}`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${pad(nextMonth)}-15`;
}

export function nextMonthEndDate(value: string) {
  const { year, month, day } = parseDate(value);
  const last = lastDayOfMonth(year, month);
  if (day < last) return `${year}-${pad(month)}-${pad(last)}`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${nextYear}-${pad(nextMonth)}-${pad(lastDayOfMonth(nextYear, nextMonth))}`;
}

export function loanDueDates(releaseDate: string, count: number, frequency: LoanFrequency) {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("The schedule needs at least one installment.");
  let cursor = releaseDate;
  return Array.from({ length: count }, () => {
    cursor = frequency === "CUTOFF" ? nextCutoffDate(cursor) : nextMonthEndDate(cursor);
    return cursor;
  });
}

export function amountToCents(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return 0n;
  const text = String(value).trim();
  const match = /^(-?)(\d{1,12})(?:\.(\d{1,6}))?$/.exec(text);
  if (!match) throw new Error("The amount is not a valid decimal.");
  const fraction = (match[3] ?? "").padEnd(3, "0");
  const cents = BigInt(match[2]) * 100n + BigInt(fraction.slice(0, 2)) + (fraction[2] >= "5" ? 1n : 0n);
  if (cents > MAX_CENTS) throw new Error("The amount is outside the supported range.");
  return match[1] === "-" ? -cents : cents;
}

export function centsToAmount(cents: bigint) {
  if (cents < -MAX_CENTS || cents > MAX_CENTS) throw new Error("The amount is outside the supported range.");
  const absolute = cents < 0n ? -cents : cents;
  return `${cents < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function percentMicros(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return 0n;
  const text = String(value).trim();
  const match = /^(\d{1,3})(?:\.(\d{1,6}))?$/.exec(text);
  if (!match) throw new Error("The percentage is not a valid decimal.");
  return BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"));
}

export function divideRoundHalfUp(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) throw new Error("The percentage denominator is invalid.");
  return (2n * numerator + denominator) / (2n * denominator);
}

export function penaltyAmount(total: string, penaltyPercent: string | number | null | undefined) {
  return centsToAmount(divideRoundHalfUp(amountToCents(total) * percentMicros(penaltyPercent), 100_000_000n));
}

export function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00Z`).valueOf() - new Date(`${from}T00:00:00Z`).valueOf()) / DAY_MS);
}

export function buildLoanSchedule(input: {
  principal: string;
  rate: string;
  markup?: string;
  method: LoanMethod;
  months: number;
  frequency: LoanFrequency;
  releaseDate: string;
}) {
  if (!Number.isSafeInteger(input.months) || input.months < 1 || input.months > 120) {
    throw new Error("Choose a term between 1 and 120 months.");
  }
  const method = input.method.toLowerCase() as Lowercase<LoanMethod>;
  const rate = input.method === "MARKUP" ? input.markup ?? "0.00" : input.rate;
  const example = calculateLoanExample(
    input.principal,
    rate,
    method,
    input.months,
    input.frequency === "CUTOFF" ? "cutoff" : "monthly",
  );
  const dates = loanDueDates(input.releaseDate, example.installments.length, input.frequency);
  const installments: LoanInstallment[] = example.installments.map((row, index) => ({
    no: index + 1,
    dueDate: dates[index],
    principal: row.principal,
    interest: row.interest,
    total: row.total,
    paidTotal: "0.00",
    paidPrincipal: "0.00",
    paidInterest: "0.00",
    penaltyAssessed: "0.00",
    penaltyPaid: "0.00",
    status: "UNPAID",
  }));
  return {
    installments,
    regularPayment: example.regularPayment,
    finalPayment: example.finalPayment,
    upfrontInterest: example.upfrontInterest,
    netProceeds: example.netProceeds,
    totalInterest: example.totalInterest,
    totalPayable: example.totalPayable,
  };
}

// Cumulative rounding assigns the full discount by the final due date.
export function upfrontInterestForInstallment(upfrontInterest: string, installment: number, count: number) {
  const cents = amountToCents(upfrontInterest);
  return divideRoundHalfUp(cents * BigInt(installment), BigInt(count)) -
    divideRoundHalfUp(cents * BigInt(installment - 1), BigInt(count));
}

export function installmentStatus(installment: LoanInstallment): InstallmentStatus {
  const paid = amountToCents(installment.paidTotal);
  const total = amountToCents(installment.total);
  if (paid >= total) return "PAID";
  return paid > 0n ? "PARTIAL" : "UNPAID";
}

export function isPastDue(installment: LoanInstallment, asOf: string) {
  return installmentStatus(installment) !== "PAID" && installment.dueDate < asOf;
}

export function penaltyDueForAssessment(
  installment: LoanInstallment,
  asOf: string,
  penaltyPercent: string | number | null | undefined,
  graceDays: number,
) {
  if (installmentStatus(installment) === "PAID") return "0.00";
  if (amountToCents(installment.penaltyAssessed) > 0n) return "0.00";
  if (installment.dueDate >= asOf || daysBetween(installment.dueDate, asOf) <= graceDays) return "0.00";
  return penaltyAmount(installment.total, penaltyPercent);
}

export function loanTotals(installments: readonly LoanInstallment[], asOf: string) {
  let remaining = 0n;
  let pastDue = 0n;
  let penalties = 0n;
  let paidCount = 0;
  let next: LoanInstallment | null = null;

  for (const installment of installments) {
    const total = amountToCents(installment.total);
    const paid = amountToCents(installment.paidTotal);
    const outstanding = total - paid > 0n ? total - paid : 0n;
    remaining += outstanding;
    if (outstanding === 0n) paidCount += 1;
    else if (!next) next = installment;
    if (outstanding > 0n && installment.dueDate < asOf) pastDue += outstanding;
    const assessed = amountToCents(installment.penaltyAssessed);
    const paidPenalty = amountToCents(installment.penaltyPaid);
    if (assessed > paidPenalty) penalties += assessed - paidPenalty;
  }

  return {
    remaining: centsToAmount(remaining),
    pastDue: centsToAmount(pastDue),
    penalties: centsToAmount(penalties),
    paidCount,
    next,
    fullyPaid: remaining === 0n && penalties === 0n,
  };
}

export function allocatePayment(
  installments: readonly LoanInstallment[],
  amount: string,
  penaltiesFirst = true,
) {
  let left = amountToCents(amount);
  if (left < 0n) throw new Error("The payment amount cannot be negative.");
  const applied = left;
  const allocations: PaymentAllocation[] = [];
  const next = installments.map(installment => ({ ...installment }));

  for (const installment of next) {
    if (left === 0n) break;
    let penalty = 0n;
    const penaltyDue = amountToCents(installment.penaltyAssessed) - amountToCents(installment.penaltyPaid);
    if (penaltiesFirst && penaltyDue > 0n) {
      penalty = penaltyDue < left ? penaltyDue : left;
      installment.penaltyPaid = centsToAmount(amountToCents(installment.penaltyPaid) + penalty);
      left -= penalty;
    }

    let principalPart = 0n;
    let interestPart = 0n;
    if (left > 0n) {
      const total = amountToCents(installment.total);
      const paid = amountToCents(installment.paidTotal);
      const due = total - paid > 0n ? total - paid : 0n;
      const principalRemaining = amountToCents(installment.principal) - amountToCents(installment.paidPrincipal);
      const interestRemaining = amountToCents(installment.interest) - amountToCents(installment.paidInterest);
      if (due > 0n && principalRemaining + interestRemaining > 0n) {
        const installmentPayment = due < left ? due : left;
        principalPart = installmentPayment === due
          ? principalRemaining
          : divideRoundHalfUp(installmentPayment * principalRemaining, principalRemaining + interestRemaining);
        if (principalPart > principalRemaining) principalPart = principalRemaining;
        interestPart = installmentPayment - principalPart;
        if (interestPart > interestRemaining) {
          principalPart += interestPart - interestRemaining;
          interestPart = interestRemaining;
        }
        installment.paidTotal = centsToAmount(paid + installmentPayment);
        installment.paidPrincipal = centsToAmount(amountToCents(installment.paidPrincipal) + principalPart);
        installment.paidInterest = centsToAmount(amountToCents(installment.paidInterest) + interestPart);
        installment.status = installmentStatus(installment);
        left -= installmentPayment;
      }
    }

    if (!penaltiesFirst && penaltyDue > 0n && left > 0n) {
      penalty = penaltyDue < left ? penaltyDue : left;
      installment.penaltyPaid = centsToAmount(amountToCents(installment.penaltyPaid) + penalty);
      left -= penalty;
    }

    if (principalPart + interestPart + penalty > 0n) {
      allocations.push({
        installmentNo: installment.no,
        principal: centsToAmount(principalPart),
        interest: centsToAmount(interestPart),
        penalty: centsToAmount(penalty),
        total: centsToAmount(principalPart + interestPart + penalty),
      });
    }
  }

  return {
    schedule: next,
    applied: centsToAmount(applied - left),
    installmentPart: centsToAmount(allocations.reduce((sum, row) => sum + amountToCents(row.principal) + amountToCents(row.interest), 0n)),
    penaltyPart: centsToAmount(allocations.reduce((sum, row) => sum + amountToCents(row.penalty), 0n)),
    allocations,
    remainder: centsToAmount(left),
  };
}
