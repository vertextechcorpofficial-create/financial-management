import type { EnrollmentEvidenceKind, LoanRequest, Page } from "../requests/types";

export const enrollmentReviewStatuses = ["ENROLLED", "RETURNED", "VERIFIED"] as const;
export const enrollmentStatuses = ["APPROVED", ...enrollmentReviewStatuses, "AGENCY_DECLINED"] as const;
export type EnrollmentStatus = typeof enrollmentStatuses[number];

export type EnrollmentTerms = {
  agencyReference: string;
  originalPrincipal: string;
  monthlyAmortization: string;
  installmentCount: number;
  installmentsPaid: number;
  firstDeductionMonth: string;
  priorLoanId: number | null;
  referenceConfirmed: boolean;
};

export type ExistingLoanForm = EnrollmentTerms & {
  employeeId: number;
  agencyId: number;
  program: string;
  transfer: boolean;
};

export type EnrollmentSnapshot = EnrollmentTerms & {
  origin: "REQUEST" | "EXISTING" | "TRANSFER" | "IMPORT";
  externalReferenceCheck: "VERIFIED" | "NEEDS_SOURCE";
  encodedBy: { id: number; name: string };
  encodedAt: string;
  payrollLoanId?: number | null;
  payrollWarnings?: string[];
  sourceRow?: number;
  importTransfer?: boolean;
  resubmittedBy?: { id: number; name: string };
  resubmittedAt?: string;
  returnReason?: string;
  verifiedBy?: { id: number; name: string };
  verifiedAt?: string;
};

export type ExistingLoanReview = {
  payrollLoanId: number | null;
  warnings: string[];
  token: string;
};

export type EnrollmentListItem = {
  id: number;
  reference: string;
  status: EnrollmentStatus;
  employeeName: string | null;
  agencyName: string | null;
  program: string;
  enrollment: EnrollmentSnapshot | null;
  importBatchId: number | null;
};

export type EnrollmentPage = Page<EnrollmentListItem> & { openMonth: string | null };
export type EnrollmentEvidence = { kind: EnrollmentEvidenceKind; name: string };
export type EnrollmentDetail = EnrollmentListItem & { request: LoanRequest; evidence: EnrollmentEvidence[] };
export type EnrollmentOutcome = { id: number; revision: number; status: "ENROLLED" | "AGENCY_DECLINED" };
export type PriorLoan = { id: number; program: string | null; reference: string | null };
