export type SetupContract = {
  month: string;
  approvalReference: string;
  cutoffs: { cutoff: string; runIds: number[]; supersededRunIds: number[] }[];
  outcomes: {
    status: "F" | "X"; runId: number; payrollLoanId: number; reference: string;
    balance?: string; instructionId?: string; zeroConfirmed?: boolean;
  }[];
  employeeControls: { runId: number; employeeId: number; actual: string }[];
  refundPayouts: { instructionId: string; reference: string; paidOn: string; amount: string }[];
  settled: boolean;
};

export type SetupPostedRun = {
  id: number;
  cutoff: string;
  postedAt: string | null;
  total: string;
  employees: number;
};

export type PeriodSetupView = {
  installed: boolean;
  openMonth: string | null;
  businessDate: string;
  settingsInstalled: boolean;
  contract: SetupContract | null;
  contractHash: string | null;
  contractMonth: string | null;
  contractMatchesOpenMonth: boolean;
  contractError: string | null;
  counts: {
    receipts: number;
    closes: number;
    remittances: number;
    billingRevisions: number;
    payrollResults: number;
    openRequests: number;
    changeInstructions: number;
    openHandoffs: number;
  };
  blockers: string[];
  canInitialize: boolean;
  canChange: boolean;
  warnings: string[];
  readiness: { agencies: number; activeLoans: number; receipts: number };
  runs: { cutoffs: { cutoff: string; runs: SetupPostedRun[] }[]; totalRuns: number; totalBenefit: string };
};

export type PayrollCoverageSummary = {
  month: string;
  approvalReference: string;
  cutoffs: { cutoff: string; runIds: number[]; supersededRunIds: number[] }[];
  runIds: number[];
  controls: number;
  controlTotal: string;
  outcomes: number;
  outcomeDetails: { status: "F" | "X"; payrollLoanId: number; reference: string; balance: string | null }[];
  refunds: number;
  settled: boolean;
};

export type PayrollCoverageValidation = {
  summary: PayrollCoverageSummary;
  warnings: string[];
  contractHash: string;
  token: string;
  openMonth: string;
};
