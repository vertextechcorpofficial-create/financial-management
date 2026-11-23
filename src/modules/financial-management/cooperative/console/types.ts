export const CONSOLE_TODAY = "2026-11-11";

export type ProductCode = "SALARY" | "EMERGENCY" | "APPLIANCE" | "RICE";
export type ProductKind = "CASH" | "GOODS";
export type RepaymentMethod = "diminishing" | "flat" | "markup";
export type PayFrequency = "cutoff" | "monthly";
export type PayMode = "payroll" | "otc";
export type MemberStatus = "ACTIVE" | "APPLIED" | "NON_MEMBER" | "SEPARATED";
export type LoanStatus = "PENDING" | "APPROVED" | "ACTIVE" | "FULLY_PAID" | "REJECTED" | "DEFAULTED";
export type WithdrawalStatus = "PENDING" | "RELEASED" | "REJECTED" | "CANCELLED";
export type CaseStatus = "DRAFT" | "COMPLETED" | "CANCELLED";
export type Channel = "payroll" | "otc" | "system";
export type JournalKind =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "LOAN_PAYMENT"
  | "DISBURSEMENT"
  | "FEE"
  | "DIVIDEND"
  | "OFFSET";

export type HistoryEntry = { date: string; text: string };

export type ProductItem = { id: string; name: string; price: number };

export type Product = {
  code: ProductCode;
  label: string;
  short: string;
  prefix: string;
  kind: ProductKind;
  active: boolean;
  rateMin: number;
  rateMax: number;
  defaultRate: number;
  methods: RepaymentMethod[];
  markup: number;
  months: number[];
  limitType: "savings" | "fixed" | "none";
  savingsMultiple: number;
  fixedCeiling: number;
  minimumMembershipMonths: number;
  frequencies: PayFrequency[];
  modes: PayMode[];
  penaltyPercent: number;
  graceDays: number;
  processingFee: number;
  documents: string[];
  items: ProductItem[];
  description: string;
};

export type MemberAgreement = {
  no: string;
  date: string;
  savingsPerCutoff: number;
  initialDeposit: number;
  fee: number;
  signed: boolean;
  beneficiary?: string;
};

export type MemberApplication = {
  date: string;
  savingsPerCutoff: number;
  initialDeposit: number;
};

export type Member = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  department: string;
  grossPay: number;
  statutoryDeductions: number;
  companyDeductions: number;
  savings: number;
  averageSavings: number;
  savingsPerCutoff: number;
  memberSince: string | null;
  status: MemberStatus;
  agreement?: MemberAgreement;
  application?: MemberApplication;
};

export type Installment = {
  no: number;
  dueDate: string;
  principal: number;
  interest: number;
  total: number;
  paid: number;
  penaltyPaid: number;
  offset?: boolean;
};

export type Loan = {
  id: string;
  code: string;
  memberId: string;
  productCode: ProductCode;
  principal: number;
  rate: number;
  markup: number;
  method: RepaymentMethod;
  months: number;
  frequency: PayFrequency;
  mode: PayMode;
  purpose: string;
  item: string | null;
  status: LoanStatus;
  issueDate: string;
  releaseDate: string | null;
  agreementNo: string;
  agreementSigned: boolean;
  releaseMethod: "payroll" | "cash";
  penaltyPercent: number;
  graceDays: number;
  processingFee: number;
  schedule: Installment[];
  history: HistoryEntry[];
};

export type Withdrawal = {
  id: string;
  code: string;
  memberId: string;
  amount: number;
  reason: string;
  method: "payroll" | "otc";
  status: WithdrawalStatus;
  date: string;
  history: HistoryEntry[];
};

export type Clearance = {
  id: string;
  code: string;
  memberId: string;
  reason: keyof typeof CLEARANCE_REASONS;
  separationDate: string;
  finalPay: number;
  notes: string;
  status: CaseStatus;
  history: HistoryEntry[];
  snapshot?: Settlement;
};

export type Settlement = {
  debt: number;
  savings: number;
  dividend: number;
  equity: number;
  fromEquity: number;
  fromFinalPay: number;
  refund: number;
  unrecovered: number;
  loans: {
    loanId: string;
    code: string;
    principal: number;
    interest: number;
    penalty: number;
    goodsBalance: number;
    total: number;
  }[];
};

export type DocumentOwner = "member" | "loan" | "case";

export type DocumentRecord = {
  id: string;
  ownerType: DocumentOwner;
  ownerId: string;
  category: string;
  name: string;
  size: number;
  mime: string;
  uploadedAt: string;
  uploadedBy: string;
};

export type JournalEntry = {
  id: string;
  date: string;
  memberId: string;
  kind: JournalKind;
  amount: number;
  channel: Channel;
  reference: string;
  loanId?: string;
  installmentPart?: number;
  penaltyPart?: number;
};

export type Settings = {
  membershipFee: number;
  minimumSavings: number;
  maintainingBalance: number;
  withdrawalsPerYear: number;
  floorMode: "fixed" | "percent";
  floorFixed: number;
  floorPercent: number;
  penaltyFirst: boolean;
};

export type DividendSettings = {
  surplus: number;
  reservePercent: number;
  educationPercent: number;
  savingsSharePercent: number;
  posted: boolean;
};

export type DividendRow = {
  memberId: string;
  averageSavings: number;
  savingsInterest: number;
  loanInterestPaid: number;
  patronageRefund: number;
  total: number;
};

export type DividendModel = {
  distributable: number;
  savingsPool: number;
  patronagePool: number;
  savingsRate: number;
  rows: DividendRow[];
};

export type ConsoleState = {
  products: Product[];
  members: Member[];
  loans: Loan[];
  withdrawals: Withdrawal[];
  cases: Clearance[];
  documents: DocumentRecord[];
  journal: JournalEntry[];
  settings: Settings;
  dividend: DividendSettings;
};

export const CLEARANCE_REASONS = {
  RESIGNATION: "Resignation",
  RETIREMENT: "Retirement",
  END_OF_CONTRACT: "End of contract",
  TERMINATION: "Termination",
  DECEASED: "Death of member",
  VOLUNTARY: "Voluntary withdrawal",
} as const;

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  ACTIVE: "Member",
  APPLIED: "Applied",
  NON_MEMBER: "Non-member",
  SEPARATED: "Separated",
};

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  PENDING: "For approval",
  APPROVED: "For release",
  ACTIVE: "Active",
  FULLY_PAID: "Fully paid",
  REJECTED: "Rejected",
  DEFAULTED: "Defaulted",
};

export const WITHDRAWAL_STATUS_LABEL: Record<WithdrawalStatus, string> = {
  PENDING: "Pending",
  RELEASED: "Released",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  DRAFT: "Settlement review",
  COMPLETED: "Settled & closed",
  CANCELLED: "Cancelled",
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  payroll: "Payroll remittance",
  otc: "Over the counter",
  system: "System",
};

export const JOURNAL_KIND_LABEL: Record<JournalKind, string> = {
  DEPOSIT: "Savings deposit",
  WITHDRAWAL: "Savings withdrawal",
  LOAN_PAYMENT: "Loan payment",
  DISBURSEMENT: "Loan release",
  FEE: "Fee",
  DIVIDEND: "Dividend",
  OFFSET: "Savings offset",
};

export const METHOD_LABEL: Record<RepaymentMethod, string> = {
  diminishing: "Diminishing balance",
  flat: "Flat",
  markup: "Markup",
};

export const FREQUENCY_LABEL: Record<PayFrequency, string> = {
  cutoff: "Every cutoff",
  monthly: "Monthly",
};

export const MODE_LABEL: Record<PayMode, string> = {
  payroll: "Salary deduction",
  otc: "Over the counter",
};
