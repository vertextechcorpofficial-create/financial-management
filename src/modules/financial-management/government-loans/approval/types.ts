import type { LoanRequest, RequestCheck, RequestListItem } from "../requests/types";

export const APPROVAL_PAGE_SIZE = 25;
export const companyDecisions = ["APPROVE", "REJECT"] as const;
export type CompanyDecision = typeof companyDecisions[number];

export type ApprovalQueueItem = Pick<RequestListItem, "id" | "reference" | "revision" | "employeeName" | "agencyName" | "program" | "amount"> & {
  requestedAt: string;
  waitingDays: number;
  filedChecksPass: boolean;
};

export type ApprovalAssessment = NonNullable<LoanRequest["filedAssessment"]>;
export type ApprovalReview = { request: LoanRequest; currentAssessment: ApprovalAssessment | null };
export type ApprovalDecisionRow = {
  id: number;
  requestId: number;
  reference: string;
  employeeName: string | null;
  agencyName: string | null;
  decision: "APPROVED" | "REJECTED";
  actorName: string;
  occurredAt: string;
  remarks: string | null;
};

export type ApprovalSelection = { id: number; expectedRevision: number };
export type ApprovalOutcome = {
  id: number;
  reference: string;
  outcome: "approved" | "skipped";
  reason: string | null;
};

export type BulkApprovalResult = { approved: number; skipped: number; items: ApprovalOutcome[] };
export type ApprovalCheckResult = Pick<RequestCheck, "result">;
