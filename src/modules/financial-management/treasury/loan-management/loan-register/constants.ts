import type {
  ApprovalStatus,
  BusinessDayRule,
  DstTreatment,
  FirstPeriodBasis,
  LenderType,
  LoanStatus,
  PaymentFrequency,
  RateType,
  RepaymentMethod,
  Security,
} from "./types";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
  info: "bg-info/15 text-info",
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
  FINANCING: "Lending company",
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
/**
 * The form spells out when the money moves, because the plain name does not say it and the timing
 * was previously only in the option subtext. Tables, filters and summaries keep the short name.
 */
export const REPAYMENT_METHOD_OPTION_LABEL: Record<RepaymentMethod, string> = {
  ...REPAYMENT_METHOD_LABEL,
  ORDINARY_ANNUITY: "Ordinary annuity (paid at period end)",
  ANNUITY_DUE: "Annuity due (paid at period start)",
};
export const REPAYMENT_METHOD_HINT: Record<RepaymentMethod, string> = {
  ORDINARY_ANNUITY: "Equal installments; interest is charged on the declining balance.",
  ANNUITY_DUE: "Equal installments; the first is paid at release and is all principal.",
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
  FOLLOWING_SAME_MONTH: "Next business day, same month",
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
  "CURRENT",
  "OVERDUE",
  "PAID_OFF",
  "PREPAID",
];
// PENDING_RELEASE is no longer offered anywhere: approval posts the release and activates the loan
// in one step. The labels stay so a row left in that state by an older build still prints a name.
export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  PENDING_APPROVAL: "Pending approval",
  REJECTED: "Rejected",
  PENDING_RELEASE: "Awaiting release",
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

/** Loans an edit dialog may still open: a decided loan is history, not a draft. */
export const EDITABLE_STATUSES: LoanStatus[] = ["PENDING_APPROVAL", "REJECTED"];
export const OPEN_STATUSES: LoanStatus[] = ["CURRENT", "OVERDUE"];
