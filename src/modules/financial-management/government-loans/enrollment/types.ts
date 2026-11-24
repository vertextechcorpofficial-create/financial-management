import type { LoanRequest, Page } from "../requests/types";

export const enrollmentStatuses = ["APPROVED", "ENROLLED", "AGENCY_DECLINED"] as const;
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
  origin: "REQUEST" | "EXISTING" | "TRANSFER";
  externalReferenceCheck: "VERIFIED" | "NEEDS_SOURCE";
  encodedBy: { id: number; name: string };
  encodedAt: string;
};

export type EnrollmentListItem = {
  id: number;
  reference: string;
  status: EnrollmentStatus;
  employeeName: string | null;
  agencyName: string | null;
  program: string;
  enrollment: EnrollmentSnapshot | null;
};

export type EnrollmentPage = Page<EnrollmentListItem> & { openMonth: string | null };
export type EnrollmentDetail = EnrollmentListItem & { request: LoanRequest };
export type EnrollmentOutcome = { id: number; revision: number; status: "ENROLLED" | "AGENCY_DECLINED" };
export type PriorLoan = { id: number; program: string | null; reference: string | null };
