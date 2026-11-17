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

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export type ApprovalAction = "SUBMITTED" | "RESUBMITTED" | "APPROVED" | "REJECTED";
export type LoanEventKind =
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "RELEASED"
  | "PAYMENT"
  | "PAYMENT_REVERSED"
  | "ENCASHED"
  | "PREPAYMENT"
  | "RATE_CHANGE"
  | "RESTRUCTURE"
  | "PAYOFF"
  | "PAS23"
  | "SOA_COMPARED"
  | "DOCUMENT"
  | "SCHEDULE_REBUILT";

/** How the money reached us. Decides which account takes the debit on release. */
export type ReleaseChannel = "CASH" | "CHECK" | "TRANSFER";

/** One row of the approvals queue: the loan, plus what a reviewer needs to decide. */
export interface ApprovalQueueRow {
  id: number;
  loanNo: string;
  lenderName: string;
  lenderType: LenderType;
  branch: string | null;
  principal: number;
  proceedsNet: number;
  installmentAmount: number;
  termPayments: number;
  annualRate: number;
  releaseDate: string;
  maturityDate: string | null;
  submittedAt: string | null;
  submittedBy: number | null;
  /** Resolved from the platform `user` table; null when the id is missing or unreadable. */
  submittedByName: string | null;
  status: LoanStatus;
  approvalStatus: ApprovalStatus;
  /** The signed-in reviewer is also the submitter. Stored as a fact for the audit trail; the UI does not warn about it. */
  selfSubmitted: boolean;
  /** Why release is refused right now, in words. Null when it would go through. */
  releaseBlockedReason: string | null;
  hasSchedule: boolean;
  proceedsAccountLabel: string | null;
}

export interface ApprovalTimelineEntry {
  id: string;
  kind: "DECISION" | "EVENT";
  action: string;
  label: string;
  occurredAt: string;
  description: string | null;
  remarks: string | null;
  amount: number | null;
  reference: string | null;
  actorName: string | null;
  selfApproved: boolean;
}

export interface ReleasePreviewLine {
  label: string;
  glCode: string | null;
  accountTitle: string | null;
  debit: number;
  credit: number;
}

export interface ReleasePreview {
  lines: ReleasePreviewLine[];
  totalDebit: number;
  totalCredit: number;
  missingMappingKeys: string[];
  channel: ReleaseChannel;
  releaseDate: string;
  accountId: number | null;
  accountLabel: string | null;
}

export interface ApprovalDetail {
  row: ApprovalQueueRow;
  accounts: LoanPaymentAccountRow[];
  timeline: ApprovalTimelineEntry[];
  preview: ReleasePreview;
  lockedThrough: string | null;
  schedulePeriods: number;
  submittedByName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  releasedAt: string | null;
  purpose: string;
  accountNo: string;
  processingFee: number;
  dstAmount: number;
  otherCosts: number;
  eirRate: number;
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
