export const applicationTypes = {
  NEW: "New loan",
  RENEWAL: "Renewal / re-loan",
} as const;

export const documentKinds = {
  APPLICATION: "Signed agency loan application",
  ID: "Valid government ID",
  AUTHORITY: "Signed authority to deduct",
  DISBURSEMENT: "Proof of disbursement account",
} as const;
export type DocumentKind = keyof typeof documentKinds;

export const enrollmentEvidenceKinds = {
  AUTHORITY: documentKinds.AUTHORITY,
  AGENCY_APPROVAL: "Agency approval notice",
  STATEMENT_OF_ACCOUNT: "Statement of account",
} as const;
export type EnrollmentEvidenceKind = keyof typeof enrollmentEvidenceKinds;
export type LoanDocumentKind = DocumentKind | EnrollmentEvidenceKind;

export const purposes = [
  "Education / tuition", "Medical / hospitalization", "Home repair or improvement",
  "Calamity / emergency", "Livelihood / small business", "Debt consolidation", "Other",
] as const;

export type RequestForm = {
  employeeId: number | null;
  agencyId: number | null;
  program: string;
  applicationType: "" | keyof typeof applicationTypes;
  renewalLoanId: number | null;
  amount: string;
  term: string;
  agencyAmortization: string;
  agencyReference: string;
  agencyFiledOn: string;
  purpose: string;
  payout: string;
  remarks: string;
  coMakerId: number | null;
  coMakerRelationship: string;
  deductionConsent: boolean;
  dataSharingConsent: boolean;
};

export const emptyRequest: RequestForm = {
  employeeId: null, agencyId: null, program: "", applicationType: "", renewalLoanId: null,
  amount: "", term: "", agencyAmortization: "", agencyReference: "", agencyFiledOn: "",
  purpose: "", payout: "", remarks: "", coMakerId: null, coMakerRelationship: "",
  deductionConsent: false, dataSharingConsent: false,
};

export type FieldErrors = Partial<Record<keyof RequestForm, string>>;
export const requestStatusLabels = {
  DRAFT: "Draft",
  REQUESTED: "Requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  ENROLLED: "For verification",
  RETURNED: "Returned for correction",
  VERIFIED: "Verified · awaiting activation",
  AGENCY_DECLINED: "Not approved by agency",
} as const;
export type RequestStatus = keyof typeof requestStatusLabels;

export const requestViews = {
  "in-progress": { label: "In progress", statuses: ["REQUESTED", "APPROVED"] },
  drafts: { label: "Drafts", statuses: ["DRAFT"] },
  decided: { label: "Decided", statuses: ["APPROVED", "REJECTED", "CANCELLED", "ENROLLED", "RETURNED", "VERIFIED", "AGENCY_DECLINED"] },
} as const satisfies Record<string, { label: string; statuses: readonly RequestStatus[] }>;
export type RequestView = keyof typeof requestViews;

export const requestDecisionLabels = {
  REQUEST_SUBMITTED: "Request submitted",
  REQUEST_APPROVED: "Request approved",
  REQUEST_REJECTED: "Request rejected",
  REQUEST_CANCELLED: "Request cancelled",
  REQUEST_ENROLLED: "Loan enrolled",
  ENROLLMENT_RETURNED: "Enrollment returned",
  ENROLLMENT_RESUBMITTED: "Enrollment resubmitted",
  ENROLLMENT_VERIFIED: "Enrollment verified",
  ENROLLMENT_EVIDENCE_UPDATED: "Enrollment evidence updated",
  ENROLLMENT_TRANSFER_RECORDED: "Import transfer status recorded",
  REQUEST_AGENCY_DECLINED: "Agency did not approve",
} as const;
export type RequestDecision = {
  id: number;
  action: keyof typeof requestDecisionLabels;
  actorName: string;
  occurredAt: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  reason: string | null;
  remarks: string | null;
};
export type EmployeeChoice = { id: number; name: string; department: string | null };
export type EmployeeSummary = EmployeeChoice & {
  position: string | null;
  status: string | null;
  basicPay: string | null;
  hiredOn: string | null;
  separationOn: string | null;
  sssNumber: string | null;
  pagIbigNumber: string | null;
  phone: string | null;
  email: string | null;
};
export type AgencyChoice = {
  id: number;
  shortCode: string;
  name: string;
  agencyType: "GOVERNMENT" | "BANK" | "OTHER";
  programs: string[];
  payoutOptions: string[];
  referenceExample?: string | null;
};
export type PayrollLoan = {
  id: number;
  agencyCode: string;
  program: string | null;
  reference: string | null;
  amortization: string;
  paid: number;
  installments: number;
};
export type Capacity = {
  basicPay: string | null;
  estimatedAmortization: string | null;
  agencyEstimate: boolean;
  existingLoans: PayrollLoan[];
  existingTotal: string | null;
  remainingPay: string | null;
  deductionPercent: string | null;
  aboveGuide: boolean | null;
};
export type RequestCheck = { label: string; result: "pass" | "review"; detail: string };
export type RequestAssessment = {
  employee: EmployeeSummary | null;
  agency: AgencyChoice | null;
  coMaker: EmployeeChoice | null;
  loans: PayrollLoan[];
  renewalUnavailable: boolean;
  fieldErrors: FieldErrors;
  capacity: Capacity | null;
  checks: RequestCheck[];
};
export type RequestDocument = { id: number; kind: DocumentKind; name: string; size: number };
export type RequestListItem = {
  id: number;
  reference: string;
  status: RequestStatus;
  revision: number;
  employeeName: string | null;
  agencyName: string | null;
  program: string;
  amount: string;
  missing: FieldErrors;
  updatedAt: string;
  requestedAt: string | null;
};
export type LoanRequest = RequestListItem & {
  form: RequestForm;
  documents: RequestDocument[];
  filedAssessment: Pick<RequestAssessment, "capacity" | "checks"> | null;
  decisionHistory: RequestDecision[];
};
export type Page<T> = { items: T[]; hasMore: boolean };
