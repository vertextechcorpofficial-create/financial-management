import { MONEY_TOLERANCE, RESTRUCTURE_THRESHOLD_PCT } from "../constants";
import type {
  ChangePlan,
  ChangePlanInput,
  ChangePreview,
  LoanFacts,
  PlannedJournalLine,
  PlannedRow,
  ScheduleStateRow,
} from "../types";
import {
  addMonths,
  amortizedCostSchedule,
  buildSchedule,
  daysBetween,
  round2,
  solvePeriodicRate,
  type ScheduleRow,
} from "./loanEngine";

/** A peso amount as a reader reads it: separators and two decimals. */
function money(value: number): string {
  return `\u20b1${value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Planning a prepayment, rate change, restructuring or payoff, with no database in sight.
 *
 * The same function is called twice: in the dialog to show the before/after figures as the desk
 * types, and in the route that writes the rows. One implementation means the preview the desk
 * approves is the arithmetic that gets posted.
 */

function num(value: number | null | undefined): number {
  return Number(value ?? 0);
}

function monthlyRate(annualPct: number): number {
  return annualPct / 100 / 12;
}

/** Rows already settled keep their figures; everything after them is rebuilt. */
function splitSchedule(schedule: readonly ScheduleStateRow[]): {
  settled: ScheduleStateRow[];
  open: ScheduleStateRow[];
} {
  const settled: ScheduleStateRow[] = [];
  const open: ScheduleStateRow[] = [];
  for (const row of schedule) {
    const paid = row.paidPrincipal > MONEY_TOLERANCE || row.paidInterest > MONEY_TOLERANCE || row.status === "PAID";
    if (open.length === 0 && paid) settled.push(row);
    else open.push(row);
  }
  return { settled, open };
}

/** Principal still owed: the unpaid part of every installment after the settled ones. */
export function outstandingPrincipal(schedule: readonly ScheduleStateRow[]): number {
  return round2(
    schedule.reduce((sum, row) => {
      const left = Math.max(0, round2(row.principal - row.paidPrincipal));
      return sum + left;
    }, 0),
  );
}

/** Interest already due but not yet paid, up to the effective date. */
function overdueInterest(schedule: readonly ScheduleStateRow[], effectiveDate: string): number {
  return round2(
    schedule
      .filter((row) => row.paymentDueDate <= effectiveDate)
      .reduce((sum, row) => sum + Math.max(0, round2(row.interest - row.paidInterest)), 0),
  );
}

/**
 * Interest that has run on an amount between two installment dates.
 *
 * The document charges interest "up to that date" on the amount prepaid; a month is thirty days
 * here, the same convention the penalty rule uses.
 */
function interestToDate(amount: number, annualPct: number, fromDate: string, toDate: string): number {
  const days = Math.max(0, daysBetween(fromDate, toDate));
  if (days === 0) return 0;
  return round2((amount * monthlyRate(annualPct) * days) / 30);
}

/** Periods needed to amortise `principal` at `installment`, the way an annuity is solved. */
function periodsFor(principal: number, annualPct: number, installment: number): number {
  const rate = monthlyRate(annualPct);
  if (principal <= MONEY_TOLERANCE) return 0;
  if (rate === 0) return Math.ceil(principal / installment);
  const ratio = (principal * rate) / installment;
  if (ratio >= 1) {
    // The installment does not even cover the interest: the loan would never amortise.
    return 0;
  }
  const periods = -Math.log(1 - ratio) / Math.log(1 + rate);
  return Math.max(1, Math.ceil(periods - 1e-9));
}

function presentValue(payments: readonly number[], rate: number): number {
  return payments.reduce((sum, payment, index) => sum + payment / Math.pow(1 + rate, index + 1), 0);
}

function copiedRow(row: ScheduleStateRow): PlannedRow {
  return {
    periodNo: row.periodNo,
    dueDate: row.dueDate,
    paymentDueDate: row.paymentDueDate,
    openingPrincipal: row.openingPrincipal,
    interest: row.interest,
    principal: row.principal,
    payment: row.payment,
    closingPrincipal: row.closingPrincipal,
    status: row.status,
    isRestated: false,
    paidPrincipal: row.paidPrincipal,
    paidInterest: row.paidInterest,
    penaltyAccrued: row.penaltyAccrued,
    openCarrying: row.openCarrying,
    eirInterest: row.eirInterest,
    costAmortization: row.costAmortization,
    closeCarrying: row.closeCarrying,
  };
}

interface RebuildInput {
  loan: LoanFacts;
  principal: number;
  annualRate: number;
  periods: number;
  firstPaymentDate: string;
  effectiveDate: string;
  startPeriod: number;
  openingCarrying: number;
  /** When set, the installment is held at this figure and the final period takes the remainder. */
  installment?: number;
}

/**
 * Amortises at a fixed installment until the principal is exhausted, so "shorten the term" really
 * does keep the payment the borrower already makes; the last period absorbs the rounding.
 */
function buildAtInstallment(input: {
  principal: number;
  annualRate: number;
  installment: number;
  firstPaymentDate: string;
  startPeriod: number;
}): ScheduleRow[] {
  const rate = monthlyRate(input.annualRate);
  const rows: ScheduleRow[] = [];
  let opening = round2(input.principal);
  let index = 0;

  while (opening > MONEY_TOLERANCE && index < 600) {
    const interest = round2(opening * rate);
    const payment = round2(Math.min(input.installment, opening + interest));
    const principal = round2(payment - interest);
    const closing = round2(opening - principal);
    const dueDate = addMonths(input.firstPaymentDate, index);
    rows.push({
      periodNo: input.startPeriod + index,
      dueDate,
      paymentDueDate: dueDate,
      openingPrincipal: opening,
      interest,
      principal,
      payment,
      closingPrincipal: closing > MONEY_TOLERANCE ? closing : 0,
      flatInterest: 0,
      rule78Interest: 0,
    });
    opening = closing > MONEY_TOLERANCE ? closing : 0;
    index += 1;
  }

  return rows;
}

/**
 * Rebuilds the remaining installments and recomputes the effective rate against the carrying
 * amount the loan already carries, so the cost amortisation catches up instead of restarting.
 */
function rebuild(input: RebuildInput): { rows: PlannedRow[]; eirAfter: number } {
  const built: ScheduleRow[] =
    input.installment && input.installment > MONEY_TOLERANCE
      ? buildAtInstallment({
          principal: input.principal,
          annualRate: input.annualRate,
          installment: input.installment,
          firstPaymentDate: input.firstPaymentDate,
          startPeriod: input.startPeriod,
        })
      : buildSchedule({
          principal: input.principal,
          annualRate: input.annualRate,
          termPayments: Math.max(1, input.periods),
          repaymentMethod: input.loan.repaymentMethod,
          paymentFrequency: input.loan.paymentFrequency,
          // Interest runs from the effective date, so the first rebuilt period is a full one.
          releaseDate: input.effectiveDate,
          firstPaymentDate: input.firstPaymentDate,
          firstPeriodBasis: "REGULAR",
          businessDayRule: input.loan.businessDayRule,
          holidays: [],
        });

  const carrying = input.openingCarrying > 0 ? input.openingCarrying : input.principal;
  const periodic = solvePeriodicRate(
    built.map((row) => row.payment),
    carrying,
    false,
  );
  const amortized = amortizedCostSchedule(built, carrying, periodic);

  const rows: PlannedRow[] = built.map((row, index) => {
    const eir = amortized[index];
    return {
      periodNo: input.startPeriod + index,
      dueDate: row.dueDate,
      paymentDueDate: row.paymentDueDate,
      openingPrincipal: row.openingPrincipal,
      interest: row.interest,
      principal: row.principal,
      payment: row.payment,
      closingPrincipal: row.closingPrincipal,
      status: "UPCOMING",
      isRestated: true,
      paidPrincipal: 0,
      paidInterest: 0,
      penaltyAccrued: 0,
      openCarrying: eir?.openingCarrying ?? 0,
      eirInterest: eir?.interestExpense ?? 0,
      costAmortization: eir?.costAmortization ?? 0,
      closeCarrying: eir?.closingCarrying ?? 0,
    };
  });

  return { rows, eirAfter: round2(periodic * 1200) };
}

function emptyPlan(input: ChangePlanInput): ChangePlan {
  return {
    kind: input.kind,
    effectiveDate: input.effectiveDate,
    version: input.loan.scheduleVersion + 1,
    rows: [],
    oldInstallment: input.loan.installmentAmount,
    newInstallment: input.loan.installmentAmount,
    oldMaturity: input.loan.maturityDate,
    newMaturity: input.loan.maturityDate,
    principalPaid: 0,
    outstandingBefore: 0,
    outstandingAfter: 0,
    accruedInterest: 0,
    overdueInterest: 0,
    penaltyRate: num(input.penaltyRate),
    penaltyAmount: 0,
    cashAmount: 0,
    gainLoss: 0,
    testPct: null,
    substantial: false,
    eirBefore: round2(input.loan.eirRate * 10000) / 100,
    eirAfter: round2(input.loan.eirRate * 10000) / 100,
    closesLoan: false,
    periodsAfter: 0,
    journalLines: [],
    notices: [],
  };
}

export function planChange(input: ChangePlanInput): ChangePreview {
  const { loan, schedule, effectiveDate, kind } = input;

  if (!["CURRENT", "OVERDUE"].includes(loan.status)) {
    return {
      plan: null,
      error: `This loan is ${loan.status.replace(/_/g, " ").toLowerCase()}, so its terms cannot be changed. Only an open loan can be prepaid, repriced, restructured or paid off.`,
    };
  }
  if (!effectiveDate) {
    return { plan: null, error: "Choose the date the change takes effect." };
  }
  if (schedule.length === 0) {
    return {
      plan: null,
      error: "This loan has no schedule yet, so there are no installments to rebuild. Release the loan first.",
    };
  }

  const { settled, open } = splitSchedule(schedule);
  const lastSettled = settled[settled.length - 1] ?? null;
  const lastPostedPayment = lastSettled?.paymentDueDate ?? null;
  if (lastPostedPayment && effectiveDate < lastPostedPayment) {
    return {
      plan: null,
      error: `The last payment posted on ${lastPostedPayment}, so a change dated ${effectiveDate} would rewrite a period that is already paid. Pick ${lastPostedPayment} or later.`,
    };
  }

  const outstanding = outstandingPrincipal(schedule);
  if (outstanding <= MONEY_TOLERANCE) {
    return { plan: null, error: "Nothing is outstanding on this loan, so there is nothing to change." };
  }

  const plan = emptyPlan(input);
  plan.outstandingBefore = outstanding;
  plan.overdueInterest = overdueInterest(open, effectiveDate);
  const startPeriod = (settled[settled.length - 1]?.periodNo ?? 0) + 1;
  const firstPaymentDate = addMonths(loan.firstPaymentDate, startPeriod - 1);
  // The carrying amount a rebuild starts from is the one the last period before the change left
  // behind, whether that period was paid or restated by an earlier change.
  const carryingRow = schedule.filter((row) => row.periodNo === startPeriod - 1).pop() ?? lastSettled;
  const openingCarrying = carryingRow?.closeCarrying ?? outstanding;
  const previousDueDate = lastSettled?.paymentDueDate ?? loan.releaseDate;

  const penaltyRate = num(input.penaltyRate);
  const baseRows = settled.map(copiedRow);

  switch (kind) {
    case "PREPAYMENT": {
      const amount = num(input.amount);
      if (amount <= MONEY_TOLERANCE) {
        return { plan: null, error: "Enter the amount being prepaid." };
      }
      if (amount > outstanding + MONEY_TOLERANCE) {
        return {
          plan: null,
          error: `The prepayment is more than the ${money(outstanding)} still owed. Use a payoff to close the loan instead.`,
        };
      }
      if (!input.prepaymentOption) {
        return { plan: null, error: "Choose whether the prepayment shortens the term or lowers the installment." };
      }

      const accrued = interestToDate(amount, loan.currentRate, previousDueDate, effectiveDate);
      const newPrincipal = round2(outstanding - amount);
      // The principal repaid leaves with the cash, so the carrying amount must drop by the same
      // amount; the last settled row carries that adjustment forward into the rebuilt installments.
      const carryingAfter = Math.max(0, openingCarrying - amount) || newPrincipal;
      const lastBase = baseRows[baseRows.length - 1];
      if (lastBase) {
        lastBase.closeCarrying = round2(carryingAfter);
        lastBase.isRestated = true;
      }
      const periods =
        input.prepaymentOption === "SHORTEN_TERM"
          ? periodsFor(newPrincipal, loan.currentRate, loan.installmentAmount)
          : Math.max(1, schedule.length - settled.length);

      if (periods === 0) {
        return {
          plan: null,
          error: `An installment of ${money(loan.installmentAmount)} does not cover the interest on ${money(newPrincipal)}, so the term cannot be shortened. Lower the installment instead.`,
        };
      }

      const built = rebuild({
        loan,
        principal: newPrincipal,
        annualRate: loan.currentRate,
        periods,
        firstPaymentDate,
        effectiveDate,
        startPeriod,
        // The principal just repaid leaves the carrying amount with it, so the effective rate is
        // measured on what is still owed rather than on the balance from before the prepayment.
        openingCarrying: carryingAfter,
        installment: input.prepaymentOption === "SHORTEN_TERM" ? loan.installmentAmount : undefined,
      });

      plan.rows = [...baseRows, ...built.rows];
      plan.periodsAfter = built.rows.length;
      plan.principalPaid = amount;
      plan.outstandingAfter = newPrincipal;
      plan.accruedInterest = accrued;
      plan.penaltyAmount = round2((amount * penaltyRate) / 100);
      plan.cashAmount = round2(amount + accrued + plan.penaltyAmount);
      plan.newInstallment = built.rows[0]?.payment ?? loan.installmentAmount;
      plan.newMaturity = built.rows[built.rows.length - 1]?.paymentDueDate ?? null;
      plan.eirAfter = built.eirAfter;

      plan.journalLines = prepaymentLines(plan, input, loan);
      if (accrued > 0) {
        plan.notices.push(
          `Interest of ${money(accrued)} on the ${money(amount)} prepaid from ${previousDueDate} to ${effectiveDate} is collected with the prepayment.`,
        );
      }
      if (plan.penaltyAmount > 0) {
        plan.notices.push(
          `The lender charges ${penaltyRate}% on the amount prepaid, so ${money(plan.penaltyAmount)} of penalty is included.`,
        );
      }
      plan.notices.push(
        `The remaining ${money(newPrincipal)} is repaid over ${built.rows.length} installments at ${loan.currentRate}%, maturing ${plan.newMaturity}.`,
      );
      break;
    }

    case "RATE_CHANGE": {
      const newRate = input.newRate;
      if (newRate === null || newRate === undefined || Number.isNaN(Number(newRate))) {
        return { plan: null, error: "Enter the new rate." };
      }
      if (newRate <= 0) return { plan: null, error: "The new rate has to be greater than zero." };
      if (newRate === loan.currentRate) {
        return { plan: null, error: `The loan already runs at ${loan.currentRate}%, so nothing would change.` };
      }

      const periods = Math.max(1, schedule.length - settled.length);
      const built = rebuild({
        loan,
        principal: outstanding,
        annualRate: newRate,
        periods,
        firstPaymentDate,
        effectiveDate,
        startPeriod,
        openingCarrying,
      });

      plan.rows = [...baseRows, ...built.rows];
      plan.periodsAfter = built.rows.length;
      plan.outstandingAfter = outstanding;
      plan.newInstallment = built.rows[0]?.payment ?? loan.installmentAmount;
      plan.newMaturity = built.rows[built.rows.length - 1]?.paymentDueDate ?? null;
      plan.eirAfter = built.eirAfter;
      // A repricing moves no money and creates no gain or loss: no journal entry is posted.
      plan.journalLines = [];
      plan.notices.push(
        `Interest runs at ${loan.currentRate}% up to ${effectiveDate} and at ${newRate}% after it; the remaining ${periods} installments are rebuilt.`,
      );
      plan.notices.push(
        plan.newMaturity && plan.newMaturity !== plan.oldMaturity
          ? `The installment goes from ${money(plan.oldInstallment)} to ${money(plan.newInstallment)} and the maturity moves from ${plan.oldMaturity} to ${plan.newMaturity}.`
          : `The installment goes from ${money(plan.oldInstallment)} to ${money(plan.newInstallment)} and the maturity stays ${plan.newMaturity}.`,
      );
      break;
    }

    case "RESTRUCTURE": {
      const newRate = input.newRate === null || input.newRate === undefined ? loan.currentRate : Number(input.newRate);
      if (newRate <= 0) return { plan: null, error: "The restructured rate has to be greater than zero." };
      const periods = input.newTermPayments && input.newTermPayments > 0 ? Math.trunc(input.newTermPayments) : Math.max(1, schedule.length - settled.length);
      if (periods < 1) return { plan: null, error: "Enter how many installments the restructured loan should run for." };

      // P137: overdue principal and interest join the new principal. Principal is already in the
      // balance; the interest that is due and unpaid is added here.
      const newPrincipal = round2(outstanding + plan.overdueInterest);
      const built = rebuild({
        loan,
        principal: newPrincipal,
        annualRate: newRate,
        periods,
        firstPaymentDate,
        effectiveDate,
        startPeriod,
        openingCarrying,
      });

      const eirMonthly = loan.eirRate > 0 ? Math.pow(1 + loan.eirRate, 1 / 12) - 1 : monthlyRate(loan.currentRate);
      const oldPayments = open.map((row) => row.payment);
      const newPayments = built.rows.map((row) => row.payment);
      const pvOld = presentValue(oldPayments, eirMonthly);
      const pvNew = presentValue(newPayments, eirMonthly);
      const testPct = pvOld > 0 ? round2(((pvOld - pvNew) / pvOld) * 10000) / 100 : 0;
      const substantial = Math.abs(testPct) >= RESTRUCTURE_THRESHOLD_PCT;

      plan.rows = [...baseRows, ...built.rows];
      plan.periodsAfter = built.rows.length;
      plan.outstandingAfter = newPrincipal;
      plan.newInstallment = built.rows[0]?.payment ?? loan.installmentAmount;
      plan.newMaturity = built.rows[built.rows.length - 1]?.paymentDueDate ?? null;
      plan.eirAfter = built.eirAfter;
      plan.testPct = testPct;
      plan.substantial = substantial;

      // PFRS 9.5.4.3: a modification that fails the 10% test is not an extinguishment. The liability
      // keeps running at the present value of the modified flows discounted at the ORIGINAL effective
      // rate, and the gap against the carrying amount is a gain or loss recognised now. A substantial
      // modification derecognises the old loan and recognises the new one at fair value.
      plan.gainLoss = round2(pvNew - openingCarrying);
      plan.journalLines = gainLossLines(plan);

      // Either way the schedule is amortised from the restated carrying amount: the original rate
      // still applies when the change is a modification, the new rate when the loan is derecognised.
      const restated = rebuild({
        loan,
        principal: newPrincipal,
        annualRate: newRate,
        periods,
        firstPaymentDate,
        effectiveDate,
        startPeriod,
        openingCarrying: pvNew,
      });
      plan.rows = [...baseRows, ...restated.rows];
      plan.periodsAfter = restated.rows.length;
      plan.newInstallment = restated.rows[0]?.payment ?? loan.installmentAmount;
      plan.newMaturity = restated.rows[restated.rows.length - 1]?.paymentDueDate ?? null;
      plan.eirAfter = substantial ? restated.eirAfter : plan.eirBefore;

      const worthPct = pvOld > 0 ? round2((pvNew / pvOld) * 100) : 100;
      const recognised = Math.abs(plan.gainLoss) > MONEY_TOLERANCE;
      const direction = plan.gainLoss > 0 ? "gain" : "loss";
      const money = (value: number) =>
        value.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      plan.notices.push(
        `The new terms are worth ${worthPct.toFixed(1)}% of the old ones at the original ${plan.eirBefore.toFixed(2)}% rate, so this is ${
          substantial
            ? "a substantial modification: the old loan is derecognised and the new terms recognised at fair value"
            : "a modification, not an extinguishment"
        }, and ${recognised ? `the ₱${money(Math.abs(plan.gainLoss))} ${direction} is recognised now` : "no gain or loss arises, so nothing goes to profit or loss"}.`,
      );
      if (plan.overdueInterest > 0) {
        plan.notices.push(`Overdue interest of ₱${money(plan.overdueInterest)} is added to the new principal.`);
      }
      break;
    }

    case "PAYOFF": {
      const accrued = interestToDate(outstanding, loan.currentRate, previousDueDate, effectiveDate);
      const penaltyAmount = round2((outstanding * penaltyRate) / 100);
      const advance = Math.max(0, loan.advanceBalance);
      // Interest accrued to the payoff date already covers every installment that has fallen due,
      // so overdue interest is not added on top of it.
      const latePenalties = round2(
        schedule.filter((row) => row.paymentDueDate <= effectiveDate).reduce((sum, row) => sum + row.penaltyAccrued, 0),
      );
      const cash = round2(outstanding + accrued + latePenalties + penaltyAmount - advance);

      plan.rows = baseRows;
      plan.principalPaid = outstanding;
      plan.outstandingAfter = 0;
      plan.accruedInterest = accrued;
      plan.penaltyAmount = round2(penaltyAmount + latePenalties);
      plan.cashAmount = Math.max(0, cash);
      plan.closesLoan = true;
      plan.gainLoss = 0;
      plan.newInstallment = 0;
      plan.newMaturity = effectiveDate;
      plan.journalLines = payoffLines(plan, loan, input, advance);

      plan.notices.push(
        `The quote is ${money(plan.cashAmount)}: principal ${money(outstanding)}, interest to ${effectiveDate} ${money(accrued)}${latePenalties > 0 ? `, late penalties ${money(latePenalties)}` : ""}${penaltyAmount > 0 ? `, prepayment penalty ${money(penaltyAmount)}` : ""}${advance > 0 ? `, less advance ${money(advance)}` : ""}.`,
      );
      plan.notices.push("The loan closes (status Prepaid) and the remaining installments are dropped from the new version.");
      break;
    }

    default:
      return { plan: null, error: "Choose the kind of change." };
  }

  if (plan.rows.length === 0) {
    return { plan: null, error: "The change would leave no installments, so nothing was planned." };
  }
  if (plan.rows[plan.rows.length - 1].closingPrincipal > MONEY_TOLERANCE && !plan.closesLoan) {
    plan.notices.push(
      `The rebuilt schedule ends with ${money(plan.rows[plan.rows.length - 1].closingPrincipal)} still outstanding; the last installment clears it.`,
    );
  }

  return { plan, error: null };
}

function prepaymentLines(plan: ChangePlan, input: ChangePlanInput, loan: LoanFacts): PlannedJournalLine[] {
  const lines: PlannedJournalLine[] = [
    {
      mappingKey: "LOAN_PRINCIPAL",
      memo: `Principal prepaid on ${loan.loanNo}`,
      debit: round2(plan.principalPaid),
      credit: 0,
    },
  ];
  if (plan.accruedInterest > 0) {
    lines.push({
      mappingKey: "ACCRUED_INTEREST",
      memo: `Interest on the amount prepaid to ${plan.effectiveDate}`,
      debit: plan.accruedInterest,
      credit: 0,
    });
  }
  if (plan.penaltyAmount > 0) {
    lines.push({
      mappingKey: "PREPAYMENT_PENALTY_EXPENSE",
      memo: `Prepayment penalty at ${num(input.penaltyRate)}%`,
      debit: plan.penaltyAmount,
      credit: 0,
    });
  }
  lines.push({
    mappingKey: "MONEY_ACCOUNT",
    memo: `Prepayment on ${loan.loanNo}`,
    debit: 0,
    credit: round2(plan.principalPaid + plan.accruedInterest + plan.penaltyAmount),
  });
  return lines.filter((line) => line.debit > 0 || line.credit > 0);
}

function payoffLines(
  plan: ChangePlan,
  loan: LoanFacts,
  input: ChangePlanInput,
  advance: number,
): PlannedJournalLine[] {
  const lines: PlannedJournalLine[] = [
    {
      mappingKey: "LOAN_PRINCIPAL",
      memo: `Loan paid off · ${loan.loanNo}`,
      debit: round2(plan.principalPaid),
      credit: 0,
    },
  ];
  // Interest accrued to the payoff date already covers every installment that has fallen due
  // (same reason the cash amount leaves overdue interest out), so adding it here would charge it twice.
  const interest = round2(plan.accruedInterest);
  if (interest > 0) {
    lines.push({
      mappingKey: "ACCRUED_INTEREST",
      memo: `Interest to the payoff date ${plan.effectiveDate}`,
      debit: interest,
      credit: 0,
    });
  }
  if (plan.penaltyAmount > 0) {
    lines.push({
      mappingKey: "PREPAYMENT_PENALTY_EXPENSE",
      memo: `Prepayment penalty at ${num(input.penaltyRate)}%`,
      debit: plan.penaltyAmount,
      credit: 0,
    });
  }
  const debitTotal = round2(lines.reduce((sum, line) => sum + line.debit, 0));
  if (advance > 0) {
    lines.push({
      mappingKey: "ADVANCE_TO_LENDER",
      memo: `Advance already with the lender`,
      debit: 0,
      credit: round2(advance),
    });
  }
  lines.push({
    mappingKey: "MONEY_ACCOUNT",
    memo: `Payoff of ${loan.loanNo}`,
    debit: 0,
    credit: round2(debitTotal - advance),
  });
  return lines.filter((line) => line.debit > 0 || line.credit > 0);
}

function gainLossLines(plan: ChangePlan): PlannedJournalLine[] {
  if (Math.abs(plan.gainLoss) <= MONEY_TOLERANCE) return [];
  const amount = Math.abs(plan.gainLoss);
  return plan.gainLoss > 0
    ? [
        { mappingKey: "LOAN_PRINCIPAL", memo: "Carrying amount released on modification", debit: amount, credit: 0 },
        { mappingKey: "MODIFICATION_GAIN", memo: "Modification gain", debit: 0, credit: amount },
      ]
    : [
        { mappingKey: "MODIFICATION_LOSS", memo: "Modification loss", debit: amount, credit: 0 },
        { mappingKey: "LOAN_PRINCIPAL", memo: "Carrying amount raised on modification", debit: 0, credit: amount },
      ];
}
