export const handoffStatusLabels = {
  QUEUED: "Queued",
  AWAITING_ACK: "Awaiting Payroll acknowledgement",
  RETRYABLE: "Retry available",
  NEEDS_REVIEW: "Needs review",
  ACCEPTED: "Acknowledged by Payroll",
} as const;

export type HandoffStatus = keyof typeof handoffStatusLabels;

export type PayrollHandoffPayload = {
  handoffId: string;
  enrollmentId: number;
  employeeId: number;
  agencyId: number;
  benefitCode: string;
  program: string;
  start: {
    id: string;
    agencyReference: string;
    effectiveMonth: string;
    monthlyAmount: string;
    remainingInstallments: number;
    payrollLoanId: number | null;
    cutoffIds?: number[];
  };
  stop: { id: string; effectiveMonth: string; cutoffId?: number; payrollLoanId: number; enrollmentId: number | null } | null;
};

export type PayrollAcknowledgement = {
  instructionId: string;
  receiptId: string;
  acknowledgedAt: string;
  effectiveMonth: string;
  cutoffId?: number;
  payrollLoanId: number;
  monthlyAmount?: string;
  remainingInstallments?: number;
  sourceRevision?: number;
  schedule?: { remainingInstallments: number; deductions: { cutoffId: number; amount: string }[] };
};

export type PayrollFileEvidence = { name: string; revision: number; importedBy: string; importedAt: string };

export type PayrollHandoffView = {
  payload: PayrollHandoffPayload;
  state: HandoffStatus;
  reason: string | null;
  acknowledgements: PayrollAcknowledgement[];
  updatedAt: string;
  fileExchange: boolean;
  lastImport: PayrollFileEvidence | null;
};

export type PayrollInstructionRow = PayrollHandoffView & {
  revision: number;
  reference: string;
  employeeName: string | null;
  agencyName: string | null;
};

export type HandoffResult = { id: number; revision: number; status: "ACTIVATING" | "ACTIVE"; handoffId: string; state: HandoffStatus };
