import type {
  BusinessDayRule,
  DstTreatment,
  FirstPeriodBasis,
  PaymentFrequency,
  RepaymentMethod,
  Security,
} from "./services/loanEngine";

export type {
  BusinessDayRule,
  DstTreatment,
  FirstPeriodBasis,
  PaymentFrequency,
  RepaymentMethod,
  Security,
};

export type LenderType = "BANK" | "FINANCING" | "GOVERNMENT" | "RELATED_PARTY" | "OTHER";
export type RateType = "FIXED" | "FLOATING";
export type Pas23Type = "SPECIFIC" | "GENERAL";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type LoanStatus =
  | "PENDING_APPROVAL"
  | "REJECTED"
  | "PENDING_RELEASE"
  | "CURRENT"
  | "OVERDUE"
  | "PAID_OFF"
  | "PREPAID";

/** The `loan` row as the database stores it. Column names match the table, no renames. */
export interface LoanRow {
  id: number;
  loan_no: string;
  lender_name: string;
  lender_type: LenderType;
  branch: string | null;
  account_officer: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  account_no: string;
  purpose: string;
  security: Security;
  security_value: number | null;
  guarantor: string | null;
  principal: number;
  nominal_rate: number;
  current_rate: number;
  rate_type: RateType;
  repayment_method: RepaymentMethod;
  payment_frequency: PaymentFrequency;
  term_payments: number;
  release_date: string;
  first_payment_date: string;
  first_period_basis: FirstPeriodBasis;
  business_day_rule: BusinessDayRule;
  proceeds_account_id: number;
  processing_fee: number;
  dst_treatment: DstTreatment;
  dst_amount: number;
  other_costs: number;
  penalty_rate_monthly: number;
  grace_days: number;
  pas23_applies: boolean | number;
  pas23_borrowing_type: Pas23Type | null;
  pas23_asset: string | null;
  pas23_capitalize_from: string | null;
  pas23_capitalize_until: string | null;
  installment_amount: number;
  proceeds_net: number;
  eir_rate: number;
  maturity_date: string | null;
  approval_status: ApprovalStatus;
  status: LoanStatus;
  schedule_version: number;
  advance_balance: number;
  submitted_at: string | null;
  submitted_by: number | null;
  approved_at: string | null;
  approved_by: number | null;
  released_at: string | null;
  closed_at: string | null;
  remarks: string | null;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
}

/** What the register table shows: the loan row plus the labels its foreign keys resolve to. */
export interface LoanListRow extends LoanRow {
  proceedsAccountLabel: string | null;
  outstandingPrincipal: number;
  paidToDate: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
}

export interface LoanPaymentAccountRow {
  id: number;
  name: string;
  kind: "BANK" | "CASH" | "EWALLET";
  coa_id: number;
  charge_pct: number;
  is_active: boolean | number;
  sort: number;
}

export interface LoanScheduleRow {
  id: number;
  loan_id: number;
  version: number;
  period_no: number;
  due_date: string;
  payment_due_date: string;
  opening_principal: number;
  interest: number;
  principal: number;
  payment: number;
  closing_principal: number;
  open_carrying: number;
  eir_interest: number;
  cost_amortization: number;
  close_carrying: number;
  flat_interest: number | null;
  rule78_interest: number | null;
  penalty_accrued: number;
  paid_penalty: number;
  paid_interest: number;
  paid_principal: number;
  status: "UPCOMING" | "DUE" | "OVERDUE" | "PARTLY_PAID" | "PAID" | "PAID_IN_ADVANCE" | "RESTRUCTURED";
  paid_on: string | null;
  is_restated: boolean | number;
}

export interface LoanSettingRow {
  setting_key: string;
  setting_value: string | null;
  updated_by: number | null;
  updated_at: string;
}

export interface LoanHolidayRow {
  id: number;
  holiday_date: string;
  name: string;
  kind: "REGULAR" | "SPECIAL" | "LOCAL";
}

export interface LoanGlMappingRow {
  mapping_key: string;
  coa_id: number | null;
  updated_by_user_id: number | null;
  updated_at: string;
}

/** Everything the register needs for one company-wide page load. */
export interface RegisterSummary {
  totals: {
    loans: number;
    current: number;
    pendingReview: number;
    outstandingPrincipal: number;
    dueThisMonth: number;
    overdueAmount: number;
    weightedRate: number | null;
  };
  accounts: LoanPaymentAccountRow[];
  notices: string[];
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

/** One row of the loan picker: the loan plus the schedule versions it actually has. */
export interface ScheduleLoanEntry {
  id: number;
  loanNo: string;
  lenderName: string;
  status: LoanStatus;
  principal: number;
  outstandingPrincipal: number;
  scheduleVersion: number;
  /** Versions present in `loan_schedule`, newest first; empty before the schedule is generated. */
  versions: number[];
  graceDays: number;
  termPayments: number;
  installmentAmount: number;
}

/** Column totals under the schedule table. The principal column is what must tie to the loan. */
export interface ScheduleTotals {
  interest: number;
  principal: number;
  payment: number;
  paidPrincipal: number;
  paidInterest: number;
  paidPenalty: number;
  paid: number;
}

/**
 * The tie test: a schedule whose installments sum to something other than the loan's principal
 * is wrong somewhere, and the screen has to say both numbers rather than quietly showing totals.
 */
export interface ScheduleTie {
  schedulePrincipal: number;
  loanPrincipal: number;
  /** Principal open on the version's first row, before any restatement step. */
  openingPrincipal: number;
  /** Principal a restructure added at a step in the chain, usually overdue interest capitalised. */
  capitalised: number;
  /** Principal the last installment leaves open; zero when the chain closes. */
  difference: number;
  ties: boolean;
}

export type AgingBucketKey = "current" | "d1_30" | "d31_60" | "d61_90" | "d91_180" | "over180";

export type AgingBuckets = Record<AgingBucketKey, number> & {
  /** Principal on installments whose payment date has passed, i.e. every bucket except `current`. */
  overduePrincipal: number;
  /** Everything unpaid, so the buckets always add up to this. */
  outstandingPrincipal: number;
};

/** Aging for one loan, as the portfolio table shows it. */
export interface LoanAgingRow {
  loanId: number;
  loanNo: string;
  lenderName: string;
  status: LoanStatus;
  graceDays: number;
  buckets: AgingBuckets;
}

/** PAS 1 split: principal payable inside twelve months, and the rest. */
export interface CurrentPortionSplit {
  asOf: string;
  current: number;
  nonCurrent: number;
  outstandingPrincipal: number;
  ties: boolean;
  schedulePrincipal: number;
  loanPrincipal: number;
}

/** The whole tab-1 payload: picker, the chosen loan's rows, and the arithmetic around them. */
export interface SchedulePayload {
  loans: ScheduleLoanEntry[];
  loan: ScheduleLoanEntry | null;
  versions: number[];
  rows: LoanScheduleRow[];
  total: number;
  totals: ScheduleTotals;
  tie: ScheduleTie | null;
  currentPortion: CurrentPortionSplit | null;
  /** Aging for the chosen loan, or the whole portfolio when no loan is picked. */
  agingRows: LoanAgingRow[];
  aging: AgingBuckets;
  asOf: string;
}

export interface RefreshResult {
  asOf: string;
  scanned: number;
  updated: number;
  markedDue: number;
  markedOverdue: number;
}
