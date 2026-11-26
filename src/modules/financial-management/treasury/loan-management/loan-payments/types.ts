import type { AllocationBucket } from "./services/allocation";

export type PaymentMethod = "CASH" | "CHECK" | "TRANSFER" | "EWALLET";
export type PaymentKind = "NORMAL" | "CATCH_UP";
export type PaymentStatus = "POSTED" | "REVERSED";
export type JournalStatus = "POSTED" | "REVERSED";

export interface PaymentAccountRow {
  id: number;
  name: string;
  kind: "BANK" | "CASH" | "EWALLET";
  coa_id: number;
  is_active: boolean | number;
  sort: number;
  /** What this channel charges on each payment, as a percentage of the amount. 0 means nothing. */
  charge_pct: number;
}

/** The `loan_payment` row as stored. Column names match the table, no renames. */
export interface LoanPaymentRow {
  id: number;
  loan_id: number;
  payment_no: string;
  payment_date: string;
  amount: number;
  account_id: number;
  method: PaymentMethod;
  check_no: string | null;
  check_date: string | null;
  encashed_on: string | null;
  encashed_account_id: number | null;
  lender_receipt: string | null;
  kind: PaymentKind;
  charge_amount: number;
  /** What the account's charge percentage added to the cash paid: an expense, not part of the installment. */
  bank_charge: number;
  advance_created: number;
  status: PaymentStatus;
  reversed_by_id: number | null;
  reverses_id: number | null;
  journal_entry_id: number | null;
  remarks: string | null;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
}

export interface AllocationRow {
  id: number;
  payment_id: number;
  installment_id: number | null;
  bucket: AllocationBucket;
  amount: number;
}

/** What the payments table shows: the payment plus the labels its foreign keys resolve to. */
export interface PaymentListRow extends LoanPaymentRow {
  loan_no: string | null;
  lenderName: string | null;
  accountLabel: string | null;
  entryNo: string | null;
  penaltyAmount: number;
  interestAmount: number;
  principalAmount: number;
  advanceAmount: number;
}

export interface InstallmentRow {
  id: number;
  period_no: number;
  due_date: string;
  payment_due_date: string;
  interest: number;
  principal: number;
  payment: number;
  paid_interest: number;
  paid_principal: number;
  status: string;
}

/** One row of the payments landing list: a loan plus what it still owes today. */
export interface PaymentLoanRow {
  id: number;
  loanNo: string;
  accountNo: string | null;
  lenderName: string;
  lenderType: string;
  principal: number;
  releaseDate: string | null;
  maturityDate: string | null;
  status: string;
  repaymentMethod: string;
  installmentAmount: number;
  advanceBalance: number;
  /** Outstanding interest, principal and penalty on installments whose payable date has passed. */
  amountDueNow: number;
  overdueAmount: number;
  overdueCount: number;
  nextDueDate: string | null;
}

/** One row of a loan's payment history. */
export interface LoanHistoryRow {
  id: number;
  payment_no: string;
  payment_date: string;
  amount: number;
  method: PaymentMethod;
  accountLabel: string | null;
  lenderReceipt: string | null;
  status: PaymentStatus;
  reversedById: number | null;
  recordedBy: string | null;
  bankCharge: number;
  penaltyAmount: number;
  interestAmount: number;
  principalAmount: number;
  advanceAmount: number;
}

/** Everything the record-payment dialog needs for one loan. */
export interface PaymentContext {
  loan: {
    id: number;
    loan_no: string;
    account_no: string | null;
    lender_name: string;
    principal: number;
    installment_amount: number;
    status: string;
    grace_days: number;
    penalty_rate_monthly: number;
    advance_balance: number;
    maturity_date: string | null;
    schedule_version: number;
  };
  /**
   * Every installment of the current schedule, settled ones included: the workspace shows a paid
   * row rather than hiding it, and the pills count all four readings.
   */
  installments: Array<{
    id: number;
    periodNo: number;
    dueDate: string;
    paymentDueDate: string;
    /** What the schedule says this period costs, before any payment. */
    payment: number;
    interest: number;
    principal: number;
    paidAmount: number;
    interestOutstanding: number;
    principalOutstanding: number;
    penalty: number;
    totalOutstanding: number;
    status: string;
    overdue: boolean;
  }>;
  accounts: PaymentAccountRow[];
  suggested: number;
  payoff: number;
  notices: string[];
}
