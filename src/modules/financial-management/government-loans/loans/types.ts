export const registerStatusLabels = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  FINAL_PAY_REQUESTED: "Final pay deduction requested",
  COMPLETED: "Completed",
  RENEWED: "Closed – renewed",
  PAID_DIRECTLY: "Closed – paid directly",
  SEPARATED: "Closed – separated",
} as const;

export const registerViews = { active: "Active", closed: "Closed", all: "All enrolled" } as const;
export type RegisterView = keyof typeof registerViews;
export type RegisterStatus = keyof typeof registerStatusLabels;

export const registerSorts = {
  reference: "Loan",
  employee: "Employee",
  agency: "Agency",
  principal: "Loan amount",
  amortization: "Amortization",
  counted: "Paid / total",
  estimate: "Estimated balance",
  statement: "Latest statement",
  difference: "Difference",
  status: "Status",
} as const;
export type RegisterSort = keyof typeof registerSorts;
export const registerPageSizes = [10, 25, 50] as const;
export type RegisterPageSize = typeof registerPageSizes[number];

export const statementSources = ["Statement of account", "Agency billing", "Agency portal", "Letter / notice"] as const;
export type StatementSource = typeof statementSources[number];

export type AgencyStatement = {
  id: string;
  date: string;
  balance: string;
  source: StatementSource;
  note: string | null;
  attachmentName: string | null;
  recordedBy: string;
  recordedAt: string;
};

type Effective = { month: string; reversed?: boolean };

export type LoanChange = Effective & (
  | { kind: "AMORTIZATION"; amount: string }
  | { kind: "SUSPENSION"; throughMonth: string }
  | { kind: "SEPARATION"; finalPayReceived: boolean; balance?: string; instructionId?: string }
  | { kind: "PAID_DIRECTLY" }
  | { kind: "RENEWED"; replacementId: number }
);

export type ConfirmedDeduction = { month: string; status: "D" | "P" | "F" | "X"; amount: string; expected: string };

export type LoanPosition = {
  status: RegisterStatus;
  active: boolean;
  amortization: string;
  counted: number;
  term: number;
  estimate: string | null;
  awaitingPayroll: boolean;
  lastDeductionShort: boolean;
  renewal: { month: string; replacementId: number } | null;
  agencyBalance: {
    latest: AgencyStatement | null;
    adjusted: string | null;
    difference: string | null;
    age: number | null;
    stale: boolean;
    flagged: boolean;
  };
};

export type RegisterLoan = LoanPosition & {
  id: number;
  revision: number;
  reference: string;
  agencyReference: string;
  employee: string;
  department: string | null;
  departmentId: number | null;
  agency: string;
  agencyId: number;
  program: string;
  principal: string;
  firstDeductionMonth: string;
};

export type LoanRegisterPage = {
  items: RegisterLoan[];
  total: number;
  hasMore: boolean;
  pageSize: number;
  filters: { agencies: { id: number; name: string }[]; departments: { id: number; name: string }[]; programs: string[] };
  summary: { active: number; withStatement: number; flagged: number; needsUpdate: number };
};

export type RegisterLoanDetail = {
  loan: RegisterLoan;
  businessDate: string;
  openMonth: string;
  statements: { items: AgencyStatement[]; hasMore: boolean };
};
