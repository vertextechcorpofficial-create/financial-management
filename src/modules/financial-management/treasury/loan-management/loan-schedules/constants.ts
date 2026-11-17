import type {
  ApprovalStatus,
  BusinessDayRule,
  DstTreatment,
  FirstPeriodBasis,
  LenderType,
  LoanScheduleRow,
  LoanStatus,
  PaymentFrequency,
  RateType,
  RepaymentMethod,
  Security,
} from "./types";

type LoanScheduleRowStatus = LoanScheduleRow["status"];

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  accent: "bg-primary/10 text-primary",
};

/** One accent per page, borrowed from the treasury family so loan pages read as siblings. */
export const ACCENT = {
  rail: "border-t-primary/40",
  tile: "border-l-primary/60 from-primary/5",
} as const;

export function toneClass(tone: Tone): string {
  return TONE_CLASS[tone];
}

export const LOAN_PAGE_SIZE = 10;

export const LENDER_TYPES: LenderType[] = ["BANK", "FINANCING", "GOVERNMENT", "RELATED_PARTY", "OTHER"];
export const LENDER_TYPE_LABEL: Record<LenderType, string> = {
  BANK: "Bank",
  FINANCING: "Financing or lending company",
  GOVERNMENT: "Government lender",
  RELATED_PARTY: "Related party",
  OTHER: "Other",
};

export const SECURITIES: Security[] = ["NONE", "REAL_ESTATE_MORTGAGE", "CHATTEL_MORTGAGE", "HOLD_OUT", "OTHER"];
export const SECURITY_LABEL: Record<Security, string> = {
  NONE: "None",
  REAL_ESTATE_MORTGAGE: "Real estate mortgage",
  CHATTEL_MORTGAGE: "Chattel mortgage",
  HOLD_OUT: "Hold-out on deposit",
  OTHER: "Other",
};

export const RATE_TYPES: RateType[] = ["FIXED", "FLOATING"];
export const RATE_TYPE_LABEL: Record<RateType, string> = {
  FIXED: "Fixed for the term",
  FLOATING: "Floating, repriced by the lender",
};

export const REPAYMENT_METHODS: RepaymentMethod[] = [
  "ORDINARY_ANNUITY",
  "ANNUITY_DUE",
  "STRAIGHT_LINE",
  "BULLET",
  "FLAT_ADD_ON",
];
export const REPAYMENT_METHOD_LABEL: Record<RepaymentMethod, string> = {
  ORDINARY_ANNUITY: "Ordinary annuity",
  ANNUITY_DUE: "Annuity due",
  STRAIGHT_LINE: "Straight-line principal",
  BULLET: "Bullet / interest only",
  FLAT_ADD_ON: "Flat-rate / add-on",
};
export const REPAYMENT_METHOD_HINT: Record<RepaymentMethod, string> = {
  ORDINARY_ANNUITY: "Equal installments at the end of each period; interest on the declining balance.",
  ANNUITY_DUE: "Equal installments at the start of each period; the first is paid at release and is all principal.",
  STRAIGHT_LINE: "Equal principal each period plus interest on the declining balance, so installments shrink.",
  BULLET: "Interest only each period, all principal at maturity.",
  FLAT_ADD_ON: "Interest on the original principal for the whole term, charged evenly. The true cost is higher than the quoted rate.",
};

export const PAYMENT_FREQUENCIES: PaymentFrequency[] = ["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"];
export const PAYMENT_FREQUENCY_LABEL: Record<PaymentFrequency, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMI_ANNUAL: "Semi-annual",
  ANNUAL: "Annual",
};

export const FIRST_PERIOD_BASES: FirstPeriodBasis[] = ["REGULAR", "ACTUAL_DAYS"];
export const FIRST_PERIOD_BASIS_LABEL: Record<FirstPeriodBasis, string> = {
  REGULAR: "Full regular period",
  ACTUAL_DAYS: "Actual days (Act/365)",
};

export const BUSINESS_DAY_RULES: BusinessDayRule[] = ["FOLLOWING", "FOLLOWING_SAME_MONTH", "NONE"];
export const BUSINESS_DAY_RULE_LABEL: Record<BusinessDayRule, string> = {
  FOLLOWING: "Next business day",
  FOLLOWING_SAME_MONTH: "Next business day in the same month",
  NONE: "Keep the date",
};
export const BUSINESS_DAY_RULE_HINT: Record<BusinessDayRule, string> = {
  FOLLOWING: "A Saturday due date moves to Monday, even if that lands in the next month.",
  FOLLOWING_SAME_MONTH: "A Saturday at the end of a month moves back to Friday instead of into the next month.",
  NONE: "Weekends and holidays are ignored; this is unusual and only right when the note says so.",
};

export const DST_TREATMENTS: DstTreatment[] = ["DEDUCTED", "PAID_BY_US", "NOT_APPLICABLE"];
export const DST_TREATMENT_LABEL: Record<DstTreatment, string> = {
  DEDUCTED: "Deducted by the lender",
  PAID_BY_US: "We pay it to the BIR",
  NOT_APPLICABLE: "Not applicable",
};

export const LOAN_STATUSES: LoanStatus[] = [
  "PENDING_APPROVAL",
  "REJECTED",
  "PENDING_RELEASE",
  "CURRENT",
  "OVERDUE",
  "PAID_OFF",
  "PREPAID",
];
export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  PENDING_APPROVAL: "Pending approval",
  REJECTED: "Rejected",
  PENDING_RELEASE: "Approved, not yet released",
  CURRENT: "Current",
  OVERDUE: "Overdue",
  PAID_OFF: "Paid off",
  PREPAID: "Prepaid in full",
};
export const LOAN_STATUS_TONE: Record<LoanStatus, Tone> = {
  PENDING_APPROVAL: "info",
  REJECTED: "danger",
  PENDING_RELEASE: "warning",
  CURRENT: "success",
  OVERDUE: "danger",
  PAID_OFF: "neutral",
  PREPAID: "neutral",
};

export const APPROVAL_STATUSES: ApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED"];
export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const PAS23_TYPES = ["SPECIFIC", "GENERAL"] as const;
export const PAS23_TYPE_LABEL: Record<string, string> = {
  SPECIFIC: "Specific borrowing",
  GENERAL: "General borrowing",
};

/** Which loan statuses can still be edited, released, prepaid or deactivated. */
export const EDITABLE_STATUSES: LoanStatus[] = ["PENDING_APPROVAL", "REJECTED", "PENDING_RELEASE"];
export const RELEASABLE_STATUSES: LoanStatus[] = ["PENDING_RELEASE"];
export const OPEN_STATUSES: LoanStatus[] = ["CURRENT", "OVERDUE"];

// ---------------------------------------------------------------------------
// Installment and aging vocabulary
// ---------------------------------------------------------------------------

export type InstallmentStatus = LoanScheduleRowStatus;

export const INSTALLMENT_STATUSES: InstallmentStatus[] = [
  "UPCOMING",
  "DUE",
  "OVERDUE",
  "PARTLY_PAID",
  "PAID",
  "PAID_IN_ADVANCE",
  "RESTRUCTURED",
];

export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  UPCOMING: "Upcoming",
  DUE: "Due",
  OVERDUE: "Overdue",
  PARTLY_PAID: "Partly paid",
  PAID: "Paid",
  PAID_IN_ADVANCE: "Paid in advance",
  RESTRUCTURED: "Restructured",
};

export const INSTALLMENT_STATUS_TONE: Record<InstallmentStatus, Tone> = {
  UPCOMING: "neutral",
  DUE: "warning",
  OVERDUE: "danger",
  PARTLY_PAID: "info",
  PAID: "success",
  PAID_IN_ADVANCE: "success",
  RESTRUCTURED: "accent",
};

/** Installment statuses the status refresh must never rewrite: money already moved on them. */
export const TOUCHED_BY_PAYMENT: InstallmentStatus[] = [
  "PAID",
  "PAID_IN_ADVANCE",
  "PARTLY_PAID",
  "RESTRUCTURED",
];

export const SCHEDULE_PAGE_SIZE = 25;

/** Bucket order the aging panel and the portfolio table both follow. */
export const AGING_BUCKETS = [
  { key: "current", label: "Current", hint: "Not yet past its payment date." },
  { key: "d1_30", label: "1–30 days", hint: "Past the payment date by up to 30 days." },
  { key: "d31_60", label: "31–60 days", hint: "Past the payment date by 31 to 60 days." },
  { key: "d61_90", label: "61–90 days", hint: "Past the payment date by 61 to 90 days." },
  { key: "d91_180", label: "91–180 days", hint: "Past the payment date by 91 to 180 days." },
  { key: "over180", label: "Over 180 days", hint: "Past the payment date by more than 180 days." },
] as const;
