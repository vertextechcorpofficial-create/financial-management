import type { PaymentFrequency, RepaymentMethod, BusinessDayRule, FirstPeriodBasis } from "./services/loanEngine";

export type ChangeKind = "PREPAYMENT" | "RATE_CHANGE" | "RESTRUCTURE" | "PAYOFF";
export type PrepaymentOption = "SHORTEN_TERM" | "LOWER_INSTALLMENT";
export type ChangeStatus = "POSTED" | "REVERSED";

/** The terms of the loan a change is measured against. */
export interface LoanFacts {
  id: number;
  loanNo: string;
  lenderName: string;
  principal: number;
  currentRate: number;
  termPayments: number;
  installmentAmount: number;
  maturityDate: string | null;
  scheduleVersion: number;
  status: string;
  advanceBalance: number;
  graceDays: number;
  penaltyRateMonthly: number;
  releaseDate: string;
  firstPaymentDate: string;
  repaymentMethod: RepaymentMethod;
  paymentFrequency: PaymentFrequency;
  firstPeriodBasis: FirstPeriodBasis;
  businessDayRule: BusinessDayRule;
  eirRate: number;
  closedAt: string | null;
}

/** One installment of the live schedule version, as the database holds it. */
export interface ScheduleStateRow {
  id: number;
  periodNo: number;
  dueDate: string;
  paymentDueDate: string;
  openingPrincipal: number;
  interest: number;
  principal: number;
  payment: number;
  closingPrincipal: number;
  status: string;
  isRestated: boolean;
  paidPrincipal: number;
  paidInterest: number;
  penaltyAccrued: number;
  openCarrying: number;
  eirInterest: number;
  costAmortization: number;
  closeCarrying: number;
}

/** A row the change writes into the next schedule version. */
export interface PlannedRow {
  periodNo: number;
  dueDate: string;
  paymentDueDate: string;
  openingPrincipal: number;
  interest: number;
  principal: number;
  payment: number;
  closingPrincipal: number;
  status: string;
  isRestated: boolean;
  paidPrincipal: number;
  paidInterest: number;
  penaltyAccrued: number;
  openCarrying: number;
  eirInterest: number;
  costAmortization: number;
  closeCarrying: number;
}

/** A journal line before the GL mapping turns its key into an account. */
export interface PlannedJournalLine {
  mappingKey: string;
  memo: string;
  debit: number;
  credit: number;
}

export interface ChangePlanInput {
  loan: LoanFacts;
  schedule: ScheduleStateRow[];
  kind: ChangeKind;
  effectiveDate: string;
  amount: number | null;
  prepaymentOption: PrepaymentOption | null;
  newRate: number | null;
  newTermPayments: number | null;
  penaltyRate: number;
}

export interface ChangePlan {
  kind: ChangeKind;
  effectiveDate: string;
  version: number;
  rows: PlannedRow[];
  oldInstallment: number;
  newInstallment: number;
  oldMaturity: string | null;
  newMaturity: string | null;
  /** Principal the change pays down (the prepayment amount, or the whole balance for a payoff). */
  principalPaid: number;
  outstandingBefore: number;
  outstandingAfter: number;
  accruedInterest: number;
  overdueInterest: number;
  penaltyRate: number;
  penaltyAmount: number;
  /** Cash the borrower hands over for this change. */
  cashAmount: number;
  gainLoss: number;
  testPct: number | null;
  substantial: boolean;
  eirBefore: number;
  eirAfter: number;
  closesLoan: boolean;
  /** Installments the rebuilt part of the schedule runs for. */
  periodsAfter: number;
  journalLines: PlannedJournalLine[];
  notices: string[];
}

/** The result of planning: a plan, or the sentence explaining why there is none. */
export type ChangePreview = { plan: ChangePlan; error: null } | { plan: null; error: string };

export interface ChangeRow {
  id: number;
  loanId: number;
  changeNo: string;
  kind: ChangeKind;
  effectiveDate: string;
  amount: number | null;
  penaltyRate: number | null;
  penaltyAmount: number;
  newRate: number | null;
  currentBorrowingRate: number | null;
  newTermPayments: number | null;
  prepaymentOption: PrepaymentOption | null;
  restructureTestPct: number | null;
  restructureSubstantial: boolean;
  gainLoss: number;
  oldInstallment: number | null;
  newInstallment: number | null;
  oldMaturity: string | null;
  newMaturity: string | null;
  scheduleVersion: number | null;
  accountId: number | null;
  status: ChangeStatus;
  reversedById: number | null;
  journalEntryId: number | null;
  notes: string | null;
  createdAt: string;
  createdBy: number | null;
}

export interface ChangeListRow extends ChangeRow {
  loanNo: string | null;
  lenderName: string | null;
  accountLabel: string | null;
  entryNo: string | null;
}

export interface ChangesSummary {
  posted: number;
  reversed: number;
  prepaymentsTotal: number;
  payoffsTotal: number;
  gainLossTotal: number;
}

export interface LoanOption {
  id: number;
  loanNo: string;
  lenderName: string;
  status: string;
  installmentAmount: number;
  outstanding: number;
}

export interface MoneyAccountOption {
  id: number;
  name: string;
  kind: string;
  coaId: number;
  code: string;
  title: string;
  label: string;
}

/** Everything the record dialog needs: the loan, its live schedule, accounts and the lock. */
export interface ChangeContext {
  loan: LoanFacts;
  schedule: ScheduleStateRow[];
  accounts: MoneyAccountOption[];
  lock: { lockedThrough: string; note: string | null } | null;
  canChange: boolean;
  blockedReason: string | null;
  lastPostedPaymentDate: string | null;
  payoff: number;
  notices: string[];
}

export interface ChangesPayload {
  rows: ChangeListRow[];
  total: number;
  summary: ChangesSummary;
  options: { loans: LoanOption[] };
}

export interface RecordChangeRequest {
  loanId: number;
  kind: ChangeKind;
  effectiveDate: string;
  amount?: number | null;
  prepaymentOption?: PrepaymentOption | null;
  newRate?: number | null;
  newTermPayments?: number | null;
  penaltyRate?: number | null;
  accountId?: number | null;
  notes?: string | null;
}
