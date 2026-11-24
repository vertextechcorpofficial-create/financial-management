import type { Page } from "../requests/types";
import type { EnrollmentDetail, EnrollmentListItem, EnrollmentSnapshot } from "./types";

export const ENROLLMENT_PAGE_SIZE = 25;
export const enrollmentDecisions = ["VERIFY", "RETURN"] as const;
export const verificationStatuses = ["ENROLLED", "VERIFIED", "ACTIVATING", "ACTIVE"] as const;
export type VerificationStatus = typeof verificationStatuses[number];
export type EnrollmentDecision = typeof enrollmentDecisions[number];

export type VerificationQueueItem = EnrollmentListItem & {
  enrollment: EnrollmentSnapshot;
  revision: number;
  canDecide: boolean;
  documentsPresent: number;
  documentsRequired: number;
};

export type VerificationQueue = Page<VerificationQueueItem> & { openMonth: string | null };
export type VerificationReview = {
  record: EnrollmentDetail & { enrollment: EnrollmentSnapshot };
  canDecide: boolean;
  canActivate: boolean;
  canManageHandoff: boolean;
  checks: { label: string; reason: string | null }[];
  payrollWarnings: string[];
};
export type VerificationSelection = { id: number; expectedRevision: number };
export type VerificationOutcome = { id: number; reference: string; outcome: "verified" | "skipped"; reason: string | null };
export type BulkVerificationResult = { verified: number; skipped: number; items: VerificationOutcome[] };
