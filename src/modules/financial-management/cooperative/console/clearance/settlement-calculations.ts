import {
  allocatePayment, amountToCents, centsToAmount, daysBetween, divideRoundHalfUp, percentMicros,
  type LoanInstallment, type PaymentAllocation,
} from "../../loans/loan-schedule";

export type SettlementLoan = {
  id: number;
  reference: string;
  kind: "CASH" | "GOODS";
  releasedOn: string;
  installments: readonly LoanInstallment[];
};

type Charge = {
  loan: SettlementLoan;
  number: number;
  dueDate: string;
  principal: bigint;
  dueInterest: bigint;
  accruedInterest: bigint;
  waivedInterest: bigint;
  penalty: bigint;
};

const interest = (charge: Charge) => charge.dueInterest + charge.accruedInterest;
const owed = (charge: Charge) => charge.principal + interest(charge) + charge.penalty;
const sum = (charges: Charge[], pick: (charge: Charge) => bigint) =>
  charges.reduce((total, charge) => total + pick(charge), 0n);

function chargesAt(loan: SettlementLoan, date: string): Charge[] {
  const next = loan.installments.findIndex(item => item.dueDate > date);

  return loan.installments.map((item, index) => {
    const principal = amountToCents(item.principal) - amountToCents(item.paidPrincipal);
    const scheduledInterest = amountToCents(item.interest);
    const paidInterest = amountToCents(item.paidInterest);
    const assessed = amountToCents(item.penaltyAssessed);
    const penalty = assessed - amountToCents(item.penaltyPaid);
    if (penalty < 0n || (assessed > 0n && !item.penaltyAssessedOn)) throw new Error("Invalid penalty assessment.");

    let dueInterest = 0n;
    let accruedInterest = 0n;
    if (loan.kind === "GOODS" || item.dueDate <= date) {
      dueInterest = scheduledInterest - paidInterest;
    } else if (index === next) {
      const start = loan.installments[index - 1]?.dueDate ?? loan.releasedOn;
      const earned = divideRoundHalfUp(scheduledInterest * BigInt(daysBetween(start, date)),
        BigInt(daysBetween(start, item.dueDate)));
      accruedInterest = earned > paidInterest ? earned - paidInterest : 0n;
    }

    const waivedInterest = scheduledInterest - paidInterest - dueInterest - accruedInterest;
    return { loan, number: item.no, dueDate: item.dueDate, principal, dueInterest, accruedInterest, waivedInterest, penalty };
  });
}

function recoveries(ordered: Charge[], allocations: PaymentAllocation[]) {
  const totals = new Map<number, bigint>();
  for (const allocation of allocations) {
    const { loan } = ordered[allocation.installmentNo - 1];
    totals.set(loan.id, (totals.get(loan.id) ?? 0n) + amountToCents(allocation.total));
  }
  return totals;
}

export function calculateSettlement(input: {
  separationDate: string;
  loans: readonly SettlementLoan[];
  savings: string;
  annualRate: string | null;
  finalPay: string | null;
  penaltiesFirst: boolean;
}) {
  const { separationDate, annualRate, finalPay, penaltiesFirst } = input;
  const savings = amountToCents(input.savings);
  if (savings < 0n) throw new Error("Invalid posted savings balance.");
  const [year, month, day] = separationDate.split("-").map(Number);
  const elapsed = Math.min(360, (month - 1) * 30 + day);
  const dividend = annualRate === null ? null
    : divideRoundHalfUp(savings * percentMicros(annualRate) * BigInt(elapsed), 100_000_000n * 360n);

  const projected = input.loans.filter(loan => loan.releasedOn <= separationDate)
    .flatMap(loan => chargesAt(loan, separationDate));
  const charges = projected.filter(charge => owed(charge) > 0n).sort((a, b) =>
      a.dueDate.localeCompare(b.dueDate) || a.loan.releasedOn.localeCompare(b.loan.releasedOn) ||
      a.loan.id - b.loan.id || a.number - b.number);
  const debt = sum(charges, owed);
  const schedule: LoanInstallment[] = charges.map((charge, index) => ({
    no: index + 1, dueDate: charge.dueDate, principal: centsToAmount(charge.principal),
    interest: centsToAmount(interest(charge)), total: centsToAmount(charge.principal + interest(charge)),
    penaltyAssessed: centsToAmount(charge.penalty), paidTotal: "0.00", paidPrincipal: "0.00",
    paidInterest: "0.00", penaltyPaid: "0.00", status: "UNPAID",
  }));
  const available = dividend === null ? null : savings + dividend;
  const savingsPayment = available === null ? null : allocatePayment(schedule, centsToAmount(available), penaltiesFirst);
  const afterSavings = savingsPayment === null ? null : debt - amountToCents(savingsPayment.applied);
  const payPayment = savingsPayment && (finalPay !== null || afterSavings === 0n)
    ? allocatePayment(savingsPayment.schedule, finalPay ?? "0.00", penaltiesFirst) : null;

  const bySavings = recoveries(charges, savingsPayment?.allocations ?? []);
  const byFinalPay = recoveries(charges, payPayment?.allocations ?? []);
  const allocations = [
    { source: "SAVINGS" as const, items: savingsPayment?.allocations ?? [] },
    { source: "FINAL_PAY" as const, items: payPayment?.allocations ?? [] },
  ].flatMap(({ source, items }) => items.map(({ installmentNo, ...amounts }) => ({
    source, loanId: charges[installmentNo - 1].loan.id, installmentNo: charges[installmentNo - 1].number, ...amounts,
  })));
  const interestWaivers = projected.filter(charge => charge.waivedInterest > 0n).map(charge => ({
    loanId: charge.loan.id, installmentNo: charge.number, amount: centsToAmount(charge.waivedInterest),
  }));
  const byLoan = new Map<number, Charge[]>();
  for (const charge of charges) {
    const list = byLoan.get(charge.loan.id) ?? [];
    list.push(charge);
    byLoan.set(charge.loan.id, list);
  }
  const loans = [...byLoan.values()].map(list => {
    const { loan } = list[0];
    const cash = loan.kind === "CASH";
    const loanDebt = sum(list, owed);
    const savingsApplied = bySavings.get(loan.id) ?? 0n;
    const finalPayApplied = byFinalPay.get(loan.id) ?? 0n;
    const remainingAfterSavings = loanDebt - savingsApplied;
    const recoveryKnown = Boolean(payPayment) || remainingAfterSavings === 0n;
    const recovered = savingsApplied + finalPayApplied;
    return {
      id: loan.id, reference: loan.reference,
      principal: cash ? centsToAmount(sum(list, charge => charge.principal)) : null,
      dueInterest: cash ? centsToAmount(sum(list, charge => charge.dueInterest)) : null,
      accruedInterest: cash ? centsToAmount(sum(list, charge => charge.accruedInterest)) : null,
      goodsInstallments: cash ? null : centsToAmount(sum(list, charge => charge.principal + interest(charge))),
      penalties: centsToAmount(sum(list, charge => charge.penalty)),
      debt: centsToAmount(loanDebt),
      savingsApplied: savingsPayment ? centsToAmount(savingsApplied) : null,
      finalPayApplied: recoveryKnown ? centsToAmount(finalPayApplied) : null,
      recovered: recoveryKnown ? centsToAmount(recovered) : null,
      remainingAfterSavings: savingsPayment ? centsToAmount(remainingAfterSavings) : null,
      remaining: recoveryKnown ? centsToAmount(loanDebt - recovered) : null,
    };
  });

  return {
    loans, debt: centsToAmount(debt), allocations, interestWaivers,
    savings: centsToAmount(savings), annualRate, year, elapsed,
    dividend: dividend === null ? null : centsToAmount(dividend),
    funding: savingsPayment && available !== null && afterSavings !== null ? {
      available: centsToAmount(available), savingsApplied: savingsPayment.applied, remainingAfterSavings: centsToAmount(afterSavings),
      finalPayApplied: payPayment?.applied ?? null,
      remaining: payPayment ? centsToAmount(afterSavings - amountToCents(payPayment.applied)) : null,
      refund: savingsPayment.remainder,
    } : null,
  };
}
