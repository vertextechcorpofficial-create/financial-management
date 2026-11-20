import {
  CONSOLE_TODAY,
  type Clearance,
  type ConsoleState,
  type DividendModel,
  type Installment,
  type Loan,
  type Member,
  type Product,
  type Settlement,
} from "./types";
import { daysBetween, round2, scheduleDates } from "./format";

type ScheduleInput = {
  principal: number;
  rate: number;
  markup: number;
  method: "diminishing" | "flat" | "markup";
  months: number;
  frequency: "cutoff" | "monthly";
  start: string;
};

export function buildSchedule(input: ScheduleInput): Installment[] {
  const periods = Math.max(1, input.months * (input.frequency === "cutoff" ? 2 : 1));
  const dates = scheduleDates(input.start, periods, input.frequency);
  if (!(input.principal > 0)) {
    return dates.map((dueDate, index) => ({
      no: index + 1,
      dueDate,
      principal: 0,
      interest: 0,
      total: 0,
      paid: 0,
      penaltyPaid: 0,
    }));
  }

  if (input.method === "diminishing" && input.rate > 0) {
    const rate = input.rate / 100 / (input.frequency === "cutoff" ? 2 : 1);
    const payment = (input.principal * rate) / (1 - Math.pow(1 + rate, -periods));
    let balance = input.principal;
    return dates.map((dueDate, index) => {
      const interest = round2(balance * rate);
      const principal = index === periods - 1 ? round2(balance) : round2(payment - interest);
      balance = round2(balance - principal);
      return {
        no: index + 1,
        dueDate,
        principal,
        interest,
        total: round2(principal + interest),
        paid: 0,
        penaltyPaid: 0,
      };
    });
  }

  const totalInterest = input.method === "markup"
    ? round2(input.principal * (input.markup / 100))
    : round2(input.principal * (input.rate / 100) * input.months);
  const principalEach = input.principal / periods;
  const interestEach = totalInterest / periods;
  let principalRun = 0;
  let interestRun = 0;
  return dates.map((dueDate, index) => {
    const principal = index === periods - 1 ? round2(input.principal - principalRun) : round2(principalEach);
    const interest = index === periods - 1 ? round2(totalInterest - interestRun) : round2(interestEach);
    principalRun = round2(principalRun + principal);
    interestRun = round2(interestRun + interest);
    return {
      no: index + 1,
      dueDate,
      principal,
      interest,
      total: round2(principal + interest),
      paid: 0,
      penaltyPaid: 0,
    };
  });
}

export const penaltyFor = (loan: Loan, installment: Installment, date = CONSOLE_TODAY) => {
  if (installment.offset || installment.paid >= installment.total - 0.005) return 0;
  if (daysBetween(installment.dueDate, date) <= loan.graceDays) return 0;
  return round2(Math.max(0, installment.total * (loan.penaltyPercent / 100) - installment.penaltyPaid));
};

export const loanTotals = (loan: Loan, date = CONSOLE_TODAY) => {
  let remaining = 0;
  let pastDue = 0;
  let penalties = 0;
  let paidInterest = 0;
  for (const installment of loan.schedule) {
    remaining += Math.max(0, installment.total - installment.paid);
    if (installment.offset) continue;
    if (installment.paid > 0) {
      const ratio = installment.total ? installment.paid / installment.total : 0;
      paidInterest += installment.interest * ratio;
    }
    if (installment.dueDate < date && installment.paid < installment.total - 0.005) {
      pastDue += installment.total - installment.paid;
      penalties += penaltyFor(loan, installment, date);
    }
  }
  return {
    remaining: round2(remaining),
    pastDue: round2(pastDue),
    penalties: round2(penalties),
    paidInterest: round2(paidInterest),
    next: loan.schedule.find(installment => installment.paid < installment.total - 0.005) ?? null,
  };
};

export const applyPayment = (loan: Loan, amount: number, date = CONSOLE_TODAY, penaltiesFirst = true) => {
  let left = round2(Math.min(amount, loanTotals(loan, date).remaining + loanTotals(loan, date).penalties));
  const applied = left;
  let installmentPart = 0;
  let penaltyPart = 0;
  const schedule = loan.schedule.map(installment => ({ ...installment }));

  for (const installment of schedule) {
    if (left <= 0) break;
    const payPenalty = () => {
      const due = penaltyFor(loan, installment, date);
      const paid = Math.min(left, due);
      if (paid > 0) {
        installment.penaltyPaid = round2(installment.penaltyPaid + paid);
        penaltyPart = round2(penaltyPart + paid);
        left = round2(left - paid);
      }
    };
    if (penaltiesFirst) payPenalty();
    if (installment.paid < installment.total - 0.005 && left > 0) {
      const due = installment.total - installment.paid;
      const paid = Math.min(left, due);
      installment.paid = round2(installment.paid + paid);
      installmentPart = round2(installmentPart + paid);
      left = round2(left - paid);
      if (installment.paid >= installment.total - 0.005) installment.paid = installment.total;
    }
    if (!penaltiesFirst && left > 0) payPenalty();
  }

  return {
    schedule,
    applied,
    installmentPart,
    penaltyPart,
    remaining: round2(left),
  };
};

export const isLoanOpen = (loan: Loan) => ["ACTIVE", "PENDING", "APPROVED"].includes(loan.status);

export const memberName = (member: Member) => `${member.firstName} ${member.lastName}`;

export const productOf = (state: ConsoleState, code: string) =>
  state.products.find(product => product.code === code);

export const memberLoans = (state: ConsoleState, memberId: string) =>
  state.loans.filter(loan => loan.memberId === memberId);

export const memberOutstanding = (state: ConsoleState, memberId: string) =>
  round2(
    memberLoans(state, memberId)
      .filter(loan => loan.status === "ACTIVE")
      .reduce((total, loan) => total + loanTotals(loan).remaining, 0),
  );

export const memberPastDue = (state: ConsoleState, memberId: string) =>
  round2(
    memberLoans(state, memberId)
      .filter(loan => loan.status === "ACTIVE")
      .reduce((total, loan) => total + loanTotals(loan).pastDue, 0),
  );

export const memberPenalties = (state: ConsoleState, memberId: string) =>
  round2(
    memberLoans(state, memberId)
      .filter(loan => loan.status === "ACTIVE")
      .reduce((total, loan) => total + loanTotals(loan).penalties, 0),
  );

export const memberHeadroom = (state: ConsoleState, member: Member) => {
  const net = member.grossPay - member.statutoryDeductions - member.companyDeductions;
  const floor = state.settings.floorMode === "fixed"
    ? state.settings.floorFixed
    : round2(member.grossPay * (state.settings.floorPercent / 100));
  const committed = state.loans
    .filter(loan => loan.memberId === member.id && loan.status === "ACTIVE" && loan.mode === "payroll")
    .reduce((total, loan) => total + (loan.schedule[0]?.total ?? 0), 0);
  return round2(net - floor - member.savingsPerCutoff - committed);
};

export const loanRoom = (state: ConsoleState, member: Member, product: Product, excludeLoanId?: string) => {
  const used = state.loans
    .filter(loan => loan.memberId === member.id && loan.productCode === product.code && loan.id !== excludeLoanId && ["ACTIVE", "APPROVED", "PENDING"].includes(loan.status))
    .reduce((total, loan) => total + loan.principal, 0);
  if (product.limitType === "fixed") return Math.max(0, round2(product.fixedCeiling - used));
  if (product.limitType === "savings") return Math.max(0, round2(member.savings * product.savingsMultiple - used));
  return Number.POSITIVE_INFINITY;
};

export const dividendModel = (state: ConsoleState): DividendModel => {
  const distributable = round2(
    state.dividend.surplus * (1 - (state.dividend.reservePercent + state.dividend.educationPercent) / 100),
  );
  const savingsPool = round2(distributable * (state.dividend.savingsSharePercent / 100));
  const patronagePool = round2(distributable - savingsPool);
  const active = state.members.filter(member => member.status === "ACTIVE");
  const totalAverage = active.reduce((total, member) => total + member.averageSavings, 0);
  const interestPaid = active.map(member =>
    state.loans
      .filter(loan => loan.memberId === member.id)
      .flatMap(loan => loan.schedule)
      .filter(installment => installment.paid > 0 && installment.dueDate.startsWith("2026"))
      .reduce((total, installment) => {
        const ratio = installment.total ? installment.paid / installment.total : 0;
        return total + installment.interest * ratio;
      }, 0),
  );
  const totalInterest = interestPaid.reduce((total, value) => total + value, 0);
  const rows = active.map((member, index) => {
    const savingsInterest = totalAverage ? round2((savingsPool * member.averageSavings) / totalAverage) : 0;
    const patronageRefund = totalInterest ? round2((patronagePool * interestPaid[index]) / totalInterest) : 0;
    return {
      memberId: member.id,
      averageSavings: member.averageSavings,
      savingsInterest,
      loanInterestPaid: round2(interestPaid[index]),
      patronageRefund,
      total: round2(savingsInterest + patronageRefund),
    };
  });
  return {
    distributable,
    savingsPool,
    patronagePool,
    savingsRate: totalAverage ? savingsPool / totalAverage : 0,
    rows,
  };
};

export const settlementFor = (state: ConsoleState, clearance: Clearance): Settlement => {
  const member = state.members.find(entry => entry.id === clearance.memberId);
  if (!member) {
    return {
      debt: 0,
      savings: 0,
      dividend: 0,
      equity: 0,
      fromEquity: 0,
      fromFinalPay: 0,
      refund: 0,
      unrecovered: 0,
      loans: [],
    };
  }
  const loans = state.loans
    .filter(loan => loan.memberId === member.id && loan.status === "ACTIVE")
    .map(loan => {
      const totals = loanTotals(loan);
      const product = productOf(state, loan.productCode);
      const goodsBalance = product?.kind === "GOODS" ? totals.remaining : 0;
      return {
        loanId: loan.id,
        code: loan.code,
        principal: product?.kind === "GOODS" ? 0 : totals.remaining,
        interest: 0,
        penalty: totals.penalties,
        goodsBalance,
        total: round2(totals.remaining + totals.penalties),
      };
    });
  const debt = round2(loans.reduce((total, loan) => total + loan.total, 0));
  const dividend = round2(member.savings * dividendModel(state).savingsRate * 0.8);
  const equity = round2(member.savings + dividend);
  const fromEquity = round2(Math.min(equity, debt));
  const shortfall = round2(Math.max(0, debt - equity));
  const fromFinalPay = round2(Math.min(shortfall, clearance.finalPay));
  const unrecovered = round2(shortfall - fromFinalPay);
  return {
    debt,
    savings: member.savings,
    dividend,
    equity,
    fromEquity,
    fromFinalPay,
    refund: round2(Math.max(0, equity - debt)),
    unrecovered,
    loans,
  };
};
