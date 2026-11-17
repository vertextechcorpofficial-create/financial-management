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

/** The pickable loans for the dialog and the filter. */
export interface LoanOption {
  id: number;
  loanNo: string;
  lenderName: string;
  principal: number;
  installmentAmount: number;
  advanceBalance: number;
  status: string;
}

/** Everything the record-payment dialog needs for one loan. */
export interface PaymentContext {
  loan: {
    id: number;
    loan_no: string;
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
  installments: Array<{
    id: number;
    periodNo: number;
    dueDate: string;
    paymentDueDate: string;
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

export interface PaymentsSummary {
  posted: number;
  amountThisMonth: number;
  penaltyCharged: number;
  advanceHeld: number;
}
