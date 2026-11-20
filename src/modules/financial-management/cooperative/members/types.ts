import type { LoanSource, LoanStatementActivity, LoanStatementTotals } from "../loans/loan-activity";
import type { SalaryLoanRoom } from "../loans/loan-assessment";
import type { WithdrawalBalance, WithdrawalSource } from "../server/withdrawal-balances";

export type MemberRegisterStatus = "MEMBER" | "NON_MEMBER" | "SEPARATED";
export type FeeChannel = "COUNTER" | "PAYROLL";
export const MEMBERSHIP_TERMS_VERSION = "cooperative-membership-v1";

export type DocumentRequirement = {
  documentTypeId: number;
  name: string;
  enforcement: "CHECK" | "WARN" | "BLOCK";
};

export type MemberDocument = {
  id: string;
  documentTypeId: number;
  documentTypeName: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  removedAt: string | null;
};

export type MemberPolicy = {
  revision: number;
  membershipFee: string;
  minimumSavings: string;
  maintainingBalance: string;
  floorMode: "FIXED" | "PERCENT";
  floorFixedAmount: string | null;
  floorPercent: string | null;
  requiredDocuments: DocumentRequirement[];
};

export type PayrollReference = {
  state: "verified";
  source: "VOS_PAYROLL";
  cutoffDate: string;
  runId: number;
  resultId: number;
  grossPay: string;
  totalDeductions: string;
  netPay: string;
} | {
  state: "unavailable";
  message: string;
};

export type RegisterCounts = {
  members: number;
  nonMembers: number;
  separated: number;
  documentsMissing: number;
};

export type RegisterItem = {
  userId: number;
  employeeNumber: string;
  employeeName: string;
  departmentName: string | null;
  membershipStatus: MemberRegisterStatus;
  membershipId: number | null;
  agreementNo: string | null;
  joinedAt: string | null;
  savingsBalance: string | null;
  documents: { required: number; onFile: number; missing: string[] } | null;
  hasCurrent: boolean;
  activeEmployee: boolean;
  canEnroll: boolean;
  loanBalance: string | null;
  pastDue: string | null;
  withdrawal: WithdrawalBalance | null;
};

export type RegisterResponse = {
  items: RegisterItem[];
  total: number;
  page: number;
  pageSize: number;
  departments: string[];
  counts: RegisterCounts;
  loanSource: LoanSource<null>;
  loanFilterUnavailable: boolean;
  withdrawalSource: WithdrawalSource<null>;
  withdrawalFilterUnavailable: boolean;
};

export const memberLoanAccountFilters = {
  "with-loan-balance": "With loan balance",
  "no-loan-balance": "No loan balance",
  "past-due": "With past due",
} as const;

export type MemberLoanAccountFilter = keyof typeof memberLoanAccountFilters;
export const memberWithdrawalAccountFilter = "with-withdrawal-request";

export type MemberCandidateEligibility = "eligible" | "already_member" | "membership_closed" | "inactive"
  | "no_posted_payroll" | "payroll_review" | "below_take_home_floor" | "unavailable";

export type MemberCandidate = {
  userId: number;
  employeeNumber: string;
  employeeName: string;
  departmentName: string | null;
  eligibility: MemberCandidateEligibility;
  reason: string;
};

export type MemberCandidatePage = {
  items: MemberCandidate[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  payrollUnavailable: boolean;
};

export type EnrollmentCheck = {
  employee: {
    userId: number;
    employeeNumber: string;
    employeeName: string;
    departmentName: string | null;
    activeEmployee: boolean;
    hasCurrent: boolean;
    currentMembershipId: number | null;
  };
  policy: MemberPolicy;
  payroll: PayrollReference;
  inputs: {
    signedAt: string;
    savingsPerCutoff: string;
    openingDeposit: string;
    feeChannel: FeeChannel;
    beneficiary: string;
  };
  values: {
    feeAmount: string;
    netPay: string | null;
    floor: string | null;
    payrollDeduction: string | null;
    headroom: string | null;
  };
  checks: Array<{ key: string; ok: boolean; label: string; detail: string }>;
  fieldErrors: Record<string, string>;
  canEnroll: boolean;
  fingerprint: string;
};

export type EnrollmentResult = {
  duplicate: boolean;
  membership: {
    membershipId: number;
    userId: number;
    employeeNumber: string;
    employeeName: string;
    departmentName: string | null;
    status: "ACTIVE";
    joinedAt: string;
    savingsPerCutoff: string;
    openingDeposit: string;
    membershipFee: string;
    feeChannel: FeeChannel;
    beneficiary: string | null;
    savingsBalance: string;
    policyRevision: number;
    agreementNo: string;
    signedAt: string;
    journalNo: string | null;
    orNo: string | null;
    journalId: number | null;
  };
};

export type EnrollmentPreview = EnrollmentCheck & {
  agreementNumberPreview: { number: string; state: "available" } | {
    state: "invalid-date" | "unavailable" | "exhausted";
    message: string;
  };
};

export type CurrentMembership = {
  id: number;
  userId: number;
  employeeNumber: string;
  employeeName: string;
  departmentName: string | null;
  status: "ACTIVE" | "SEPARATED";
  joinedAt: string;
  savingsPerCutoff: string;
  openingDeposit: string;
  membershipFee: string;
  feeChannel: FeeChannel;
  beneficiary: string | null;
  savingsBalance: string;
  journalId: number | null;
  journalNo: string | null;
  orNo: string | null;
  policyRevision: number;
  createdAt: string;
};

export type MembershipAgreement = {
  id: number;
  membershipId: number;
  agreementNo: string;
  signedAt: string;
  policyRevision: number;
  termsSnapshot: Record<string, unknown>;
  createdAt: string;
};

export type SavingsEntry = {
  id: number;
  membershipId: number;
  entryDate: string;
  kind: "OPENING" | "DEPOSIT" | "WITHDRAWAL" | "DIVIDEND" | "OFFSET";
  amount: string;
  balanceAfter: string;
  journalId: number;
  reference: string;
  postedAt: string;
};

export type StatementPeriod = { from: string; to: string };

export type MemberStatement = StatementPeriod & {
  generatedOn: string;
  member: {
    name: string;
    employeeNumber: string;
    department: string | null;
    agreementNo: string | null;
    status: CurrentMembership["status"];
  };
  openingBalance: string;
  closingBalance: string;
  deposits: string;
  withdrawals: string;
  entries: Array<Pick<SavingsEntry, "id" | "entryDate" | "kind" | "reference"> & {
    deposit: string | null;
    withdrawal: string | null;
    runningBalance: string;
  }>;
  loans: LoanSource<{
    entries: Array<LoanStatementTotals & { loanNo: string; productName: string; id: number }>;
    totals: LoanStatementTotals;
    activity: Array<LoanStatementActivity & { loanNo: string }>;
  }>;
};

export type MemberDocumentList = {
  items: MemberDocument[];
  documentTypes: Array<{ id: number; name: string }>;
  hasMore: boolean;
};

export type MemberDetail = {
  item: RegisterItem;
  current: CurrentMembership | null;
  agreement: MembershipAgreement | null;
  policy: MemberPolicy;
  documents: MemberDocument[];
  documentStorageReady: boolean;
  requiredDocuments: DocumentRequirement[];
  savingsEntries: SavingsEntry[];
  payroll: PayrollReference;
  takeHome: {
    floor: string | null;
    savingsPerCutoff: string | null;
    payrollDeduction: string | null;
    loanDeduction: string | null;
    includedInNetPay: string | null;
    assessmentCutoff: string | null;
    headroom: string | null;
    headroomMessage: string | null;
    withdrawalsUnavailable: boolean;
  };
  loans: LoanSource<{
    penalties: string;
    salaryRoom: SalaryLoanRoom;
    items: MemberLoanSummary[];
  }> | null;
  withdrawals: WithdrawalSource<WithdrawalBalance> | null;
};

export type MemberLoanSummary = {
  id: number;
  loanNo: string;
  productName: string;
  status: string;
  amountPerPayment: string | null;
  balance: string | null;
  requiredDocuments: number;
  documentsMissing: number;
};

export type MemberPageQuery = {
  q?: string;
  department?: string;
  membership?: "" | MemberRegisterStatus;
  account?: "" | "documents" | MemberLoanAccountFilter | typeof memberWithdrawalAccountFilter;
  page?: number;
};
