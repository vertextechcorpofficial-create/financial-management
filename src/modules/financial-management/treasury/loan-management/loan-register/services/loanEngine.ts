/**
 * Loan math for the register, the schedules and the payments screens.
 *
 * The rules come from the loan management specification and are implemented to match
 * the prototype that accounting signed off on, so a schedule built here and the same
 * loan built in the prototype produce the same pesos. Every function is pure: dates in,
 * dates out, no clock reads.
 */

export type RepaymentMethod =
  | "ORDINARY_ANNUITY"
  | "ANNUITY_DUE"
  | "STRAIGHT_LINE"
  | "BULLET"
  | "FLAT_ADD_ON";

export type PaymentFrequency = "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL";

export type BusinessDayRule = "FOLLOWING" | "FOLLOWING_SAME_MONTH" | "NONE";

export type FirstPeriodBasis = "REGULAR" | "ACTUAL_DAYS";

const MS_PER_DAY = 86_400_000;

export function round2(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + 1e-9)) / 100;
}

export function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function toUtc(iso: string): number {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromUtc(value: number): string {
  const date = new Date(value);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * MS_PER_DAY);
}

/** Month arithmetic that clamps the day: 31 Jan + 1 month = 28/29 Feb, never 3 March. */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const target = month - 1 + months;
  const targetYear = year + Math.floor(target / 12);
  const targetMonth = ((target % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

export function periodsPerYear(frequency: PaymentFrequency): number {
  return frequency === "MONTHLY" ? 12 : frequency === "QUARTERLY" ? 4 : frequency === "SEMI_ANNUAL" ? 2 : 1;
}

export function monthsPerPeriod(frequency: PaymentFrequency): number {
  return 12 / periodsPerYear(frequency);
}

function isWeekend(iso: string): boolean {
  const weekday = new Date(toUtc(iso)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function isBusinessDay(iso: string, holidays: readonly string[]): boolean {
  return !isWeekend(iso) && !holidays.includes(iso);
}

/**
 * Moves a due date off a weekend or holiday.
 *
 * FOLLOWING_SAME_MONTH never rolls into the next month: if the following business day
 * crosses the month end it walks backwards instead, which is what most bank notes say.
 */
export function adjustToBusinessDay(iso: string, rule: BusinessDayRule, holidays: readonly string[]): string {
  if (rule === "NONE" || isBusinessDay(iso, holidays)) return iso;
  if (rule === "FOLLOWING") {
    let candidate = iso;
    for (let guard = 0; guard < 30; guard += 1) {
      candidate = addDays(candidate, 1);
      if (isBusinessDay(candidate, holidays)) return candidate;
    }
    return iso;
  }
  const month = iso.slice(0, 7);
  let forward = iso;
  for (let guard = 0; guard < 30; guard += 1) {
    forward = addDays(forward, 1);
    if (forward.slice(0, 7) !== month) break;
    if (isBusinessDay(forward, holidays)) return forward;
  }
  let backward = iso;
  for (let guard = 0; guard < 30; guard += 1) {
    backward = addDays(backward, -1);
    if (backward.slice(0, 7) !== month) return iso;
    if (isBusinessDay(backward, holidays)) return backward;
  }
  return iso;
}

// ---------------------------------------------------------------------------
// Documentary stamp tax
// ---------------------------------------------------------------------------

export type DstTreatment = "DEDUCTED" | "PAID_BY_US" | "NOT_APPLICABLE";
export type Security = "NONE" | "REAL_ESTATE_MORTGAGE" | "CHATTEL_MORTGAGE" | "HOLD_OUT" | "OTHER";

/**
 * Documentary stamp tax on a loan.
 *
 * â‚±1.50 for every â‚±200 of principal, rounded up, prorated by actual days when the term is
 * shorter than a year. A mortgage raises the floor: â‚±40 for the first â‚±5,000 plus â‚±20 for
 * every â‚±5,000 after that. The higher of the two applies, which is why a small secured loan
 * pays the mortgage floor rather than the ten-centavo base.
 */
export function documentaryStampTax(
  principal: number,
  termDays: number,
  security: Security,
): number {
  if (principal <= 0) return 0;
  const base = Math.ceil(principal / 200) * 1.5 * (termDays < 365 ? termDays / 365 : 1);
  const mortgage =
    security === "REAL_ESTATE_MORTGAGE" || security === "CHATTEL_MORTGAGE"
      ? principal <= 5000
        ? 40
        : 40 + 20 * Math.ceil((principal - 5000) / 5000)
      : 0;
  return round2(Math.max(base, mortgage));
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export interface ScheduleInput {
  principal: number;
  /** Nominal annual rate in percent, e.g. 9 for 9% p.a. */
  annualRate: number;
  termPayments: number;
  repaymentMethod: RepaymentMethod;
  paymentFrequency: PaymentFrequency;
  releaseDate: string;
  firstPaymentDate: string;
  firstPeriodBasis: FirstPeriodBasis;
  businessDayRule: BusinessDayRule;
  holidays: readonly string[];
}

export interface ScheduleRow {
  periodNo: number;
  /** The contractual date before any business-day adjustment. */
  dueDate: string;
  /** The date the borrower actually pays on. */
  paymentDueDate: string;
  openingPrincipal: number;
  interest: number;
  principal: number;
  payment: number;
  closingPrincipal: number;
  /** Only for flat-rate loans: the interest billed under the flat method. */
  flatInterest: number | null;
  /** Only for flat-rate loans: the Rule of 78s split for this period. */
  rule78Interest: number | null;
}

/**
 * Builds the contractual amortisation schedule.
 *
 * Annuity methods discount to the release date, so the first period's interest is a full
 * period unless the loan asks for actual days. Annuity due moves every payment one period
 * earlier, which makes the first installment pure principal. Straight line and flat split
 * the principal evenly; bullet pays interest only until the last period. In every method the
 * final installment clears whatever principal is left, so the schedule cannot drift by a cent.
 */
export function buildSchedule(input: ScheduleInput): ScheduleRow[] {
  const { principal, termPayments, repaymentMethod, paymentFrequency } = input;
  const periods = Math.max(1, Math.trunc(termPayments));
  const perYear = periodsPerYear(paymentFrequency);
  const stepMonths = monthsPerPeriod(paymentFrequency);
  const rate = input.annualRate / 100 / perYear;

  const dates: string[] = [];
  const pays: string[] = [];
  for (let index = 0; index < periods; index += 1) {
    if (repaymentMethod === "ANNUITY_DUE") {
      const due = index === 0 ? input.releaseDate : addMonths(input.firstPaymentDate, (index - 1) * stepMonths);
      dates.push(index === 0 ? input.releaseDate : addMonths(input.firstPaymentDate, (index - 1) * stepMonths));
      pays.push(adjustToBusinessDay(due, input.businessDayRule, input.holidays));
    } else {
      const due = addMonths(input.firstPaymentDate, index * stepMonths);
      dates.push(due);
      pays.push(adjustToBusinessDay(due, input.businessDayRule, input.holidays));
    }
  }

  const firstPeriodDays = Math.max(0, daysBetween(input.releaseDate, dates[0]));
  const rows: ScheduleRow[] = [];
  let opening = principal;

  let levelPayment = 0;
  if (repaymentMethod === "ORDINARY_ANNUITY" || repaymentMethod === "ANNUITY_DUE") {
    levelPayment =
      rate === 0
        ? principal / periods
        : (principal * rate * Math.pow(1 + rate, periods)) / (Math.pow(1 + rate, periods) - 1);
  }

  const flatTotal = round2((principal * (input.annualRate / 100) * periods) / perYear);
  let flatRemaining = flatTotal;

  for (let index = 0; index < periods; index += 1) {
    const isLast = index === periods - 1;
    const actualDays = index === 0 ? firstPeriodDays : daysBetween(dates[index - 1], dates[index]);
    const useActualDays =
      input.firstPeriodBasis === "ACTUAL_DAYS" && index === 0 && daysBetween(input.releaseDate, dates[0]) > 0;

    let interest: number;
    let principalPart: number;

    if (repaymentMethod === "BULLET") {
      interest = round2((opening * (input.annualRate / 100) * actualDays) / 365);
      principalPart = isLast ? opening : 0;
    } else if (repaymentMethod === "STRAIGHT_LINE") {
      interest = round2(opening * rate);
      principalPart = isLast ? opening : round2(principal / periods);
    } else if (repaymentMethod === "FLAT_ADD_ON") {
      interest = isLast ? flatRemaining : round2(flatTotal / periods);
      flatRemaining = round2(flatRemaining - interest);
      principalPart = isLast ? opening : round2(principal / periods);
    } else {
      // Annuity due: the first installment is paid at release, so it carries no interest yet;
      // the interest for the period that follows is collected with the second installment.
      if (repaymentMethod === "ANNUITY_DUE" && index === 0) {
        interest = 0;
      } else if (useActualDays) {
        interest = round2((opening * (input.annualRate / 100) * actualDays) / 365);
      } else {
        interest = round2(opening * rate);
      }
      const payment = round2(levelPayment);
      principalPart = isLast ? opening : Math.min(opening, round2(payment - interest));
    }

    const payment = round2(interest + principalPart);
    const closing = round2(opening - principalPart);
    const rule78 =
      repaymentMethod === "FLAT_ADD_ON"
        ? round2((flatTotal * (periods - index)) / ((periods * (periods + 1)) / 2))
        : null;

    rows.push({
      periodNo: index + 1,
      dueDate: dates[index],
      paymentDueDate: pays[index],
      openingPrincipal: round2(opening),
      interest,
      principal: round2(principalPart),
      payment,
      closingPrincipal: Math.max(0, closing),
      flatInterest: repaymentMethod === "FLAT_ADD_ON" ? interest : null,
      rule78Interest: rule78,
    });
    opening = Math.max(0, closing);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Proceeds and effective interest
// ---------------------------------------------------------------------------

export interface ProceedsInput {
  principal: number;
  processingFee: number;
  dstAmount: number;
  dstTreatment: DstTreatment;
  otherCosts: number;
}

/** Cash actually received: the lender deducts their fee and any tax or cost they pay up front. */
export function netProceeds(input: ProceedsInput): number {
  const dstDeducted = input.dstTreatment === "DEDUCTED" ? input.dstAmount : 0;
  return round2(input.principal - input.processingFee - dstDeducted - input.otherCosts);
}

function presentValue(payments: readonly number[], rate: number, advance: boolean): number {
  const start = advance ? 0 : 1;
  return payments.reduce((sum, payment, index) => sum + payment / Math.pow(1 + rate, start + index), 0);
}

/**
 * Solves the periodic rate that discounts the installments to the net proceeds.
 *
 * Bisection rather than Newton: the rate is monotonic across the search band and bisection
 * cannot diverge on the near-zero or very small rate cases that Newton mishandles.
 */
export function solvePeriodicRate(
  payments: readonly number[],
  target: number,
  advance: boolean,
): number {
  if (payments.length === 0 || target <= 0) return 0;
  let low = -0.9999;
  let high = 1;
  let guard = 0;
  while (presentValue(payments, high, advance) > target && guard < 200) {
    high *= 2;
    guard += 1;
  }
  for (let index = 0; index < 300; index += 1) {
    const mid = (low + high) / 2;
    if (presentValue(payments, mid, advance) > target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export interface AmortizedRow {
  periodNo: number;
  paymentDueDate: string;
  openingCarrying: number;
  interestExpense: number;
  contractualInterest: number;
  costAmortization: number;
  principal: number;
  payment: number;
  closingCarrying: number;
}

/**
 * Effective interest method (PFRS 9): the carrying amount accretes at the EIR and the
 * difference against the contractual interest is the amortisation of fees and costs.
 * The final period is closed out to zero so the carrying amount cannot end on a stray cent.
 */
export function amortizedCostSchedule(
  rows: readonly ScheduleRow[],
  proceeds: number,
  periodicRate: number,
): AmortizedRow[] {
  let carrying = proceeds;
  return rows.map((row, index) => {
    const isLast = index === rows.length - 1;
    const interestExpense = isLast ? round2(row.payment - carrying) : round2(carrying * periodicRate);
    const amortization = round2(interestExpense - row.interest);
    const closing = isLast ? 0 : round2(carrying + interestExpense - row.payment);
    const result: AmortizedRow = {
      periodNo: row.periodNo,
      paymentDueDate: row.paymentDueDate,
      openingCarrying: round2(carrying),
      interestExpense,
      contractualInterest: row.interest,
      costAmortization: amortization,
      principal: row.principal,
      payment: row.payment,
      closingCarrying: closing,
    };
    carrying = closing;
    return result;
  });
}

export interface LoanPreview {
  installmentAmount: number;
  schedule: ScheduleRow[];
  netProceeds: number;
  dstAmount: number;
  periodicRate: number;
  /** Annualised, compounded at the payment frequency: (1 + i)^periodsPerYear âˆ’ 1. */
  effectiveAnnualRate: number;
  maturityDate: string;
  amortized: AmortizedRow[];
  /** Money the loan costs over its life: every payment minus the principal. */
  totalInterest: number;
  totalFeesAndCosts: number;
}

export function previewLoan(input: ScheduleInput & ProceedsInput): LoanPreview {
  const schedule = buildSchedule(input);
  const proceeds = netProceeds(input);
  const perYear = periodsPerYear(input.paymentFrequency);
  const advance = input.repaymentMethod === "ANNUITY_DUE";
  const payments = schedule.map((row) => row.payment);
  const periodicRate = solvePeriodicRate(payments, proceeds, advance);
  const amortized = amortizedCostSchedule(schedule, proceeds, periodicRate);
  const totalPaid = round2(payments.reduce((sum, payment) => sum + payment, 0));
  const lastRow = schedule[schedule.length - 1];

  return {
    installmentAmount: schedule[0]?.payment ?? 0,
    schedule,
    netProceeds: proceeds,
    dstAmount: input.dstAmount,
    periodicRate,
    effectiveAnnualRate: Math.pow(1 + periodicRate, perYear) - 1,
    maturityDate: lastRow?.paymentDueDate ?? input.firstPaymentDate,
    amortized,
    totalInterest: round2(totalPaid - input.principal),
    totalFeesAndCosts: round2(input.processingFee + input.otherCosts + input.dstAmount),
  };
}

// ---------------------------------------------------------------------------
// Penalties, allocation and the current portion
// ---------------------------------------------------------------------------

/** Daily penalty on an overdue installment, charged only once the grace period has passed. */
export function penaltyAccrued(
  overdueAmount: number,
  daysLate: number,
  graceDays: number,
  monthlyRatePercent: number,
): number {
  const chargeable = daysLate - graceDays;
  if (overdueAmount <= 0 || chargeable <= 0 || monthlyRatePercent <= 0) return 0;
  return round2(((overdueAmount * monthlyRatePercent) / 100 / 30) * chargeable);
}

export type AllocationBucket = "PENALTY" | "INTEREST" | "PRINCIPAL" | "ADVANCE";

export interface AllocationLine {
  bucket: AllocationBucket;
  amount: number;
}

export interface InstallmentDue {
  periodNo: number;
  dueDate: string;
  penalty: number;
  interestOutstanding: number;
  principalOutstanding: number;
}

/**
 * Applies money to the oldest installment first: penalties, then interest, then principal.
 * Anything left over is held as an advance for the borrower, which is how the bank side of
 * the ledger treats an overpayment.
 */
export function allocatePayment(due: readonly InstallmentDue[], amount: number): AllocationLine[] {
  const lines: AllocationLine[] = [];
  let remaining = round2(amount);

  for (const installment of due) {
    if (remaining <= 0) break;
    const order: Array<[AllocationBucket, number]> = [
      ["PENALTY", round2(installment.penalty)],
      ["INTEREST", round2(installment.interestOutstanding)],
      ["PRINCIPAL", round2(installment.principalOutstanding)],
    ];
    for (const [bucket, outstanding] of order) {
      if (remaining <= 0) break;
      if (outstanding <= 0) continue;
      const applied = Math.min(remaining, outstanding);
      if (applied > 0) lines.push({ bucket, amount: round2(applied) });
      remaining = round2(remaining - applied);
    }
  }

  if (remaining > 0) lines.push({ bucket: "ADVANCE", amount: remaining });
  return lines;
}

/**
 * PAS 1 split: principal falling due inside twelve months is current, the rest is non-current.
 * Installments already overdue are current too, because they are payable now.
 */
export function currentPortion(
  schedule: readonly ScheduleRow[],
  paidByPeriod: ReadonlyMap<number, number>,
  asOf: string,
): { current: number; nonCurrent: number } {
  const cutoff = addMonths(asOf, 12);
  let current = 0;
  let nonCurrent = 0;
  for (const row of schedule) {
    const remaining = round2(row.principal - (paidByPeriod.get(row.periodNo) ?? 0));
    if (remaining <= 0) continue;
    if (row.paymentDueDate <= cutoff) current = round2(current + remaining);
    else nonCurrent = round2(nonCurrent + remaining);
  }
  return { current, nonCurrent };
}

