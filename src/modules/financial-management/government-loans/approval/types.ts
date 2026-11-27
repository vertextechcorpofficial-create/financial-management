import type { LoanRequest, Page, RequestCheck, RequestListItem } from "../requests/types";

export const APPROVAL_PAGE_SIZE = 25;
export const approvalPageSizes = [10, 25, 50] as const;
export const approvalSorts = {
  reference: "Request",
  employee: "Employee",
  agency: "Agency",
  program: "Program",
  amount: "Amount",
  filed: "Filed",
  waiting: "Waiting",
  checks: "Checks",
} as const;
export type ApprovalSort = keyof typeof approvalSorts;
export const companyDecisions = ["APPROVE", "REJECT"] as const;
export type CompanyDecision = typeof companyDecisions[number];

export type ApprovalQueueCheck = Pick<RequestCheck, "label" | "result" | "detail">;
export type ApprovalQueueItem = Pick<RequestListItem, "id" | "reference" | "revision" | "employeeName" | "agencyName" | "program" | "amount"> & {
  requestedAt: string;
  filedBy: string | null;
  waitingDays: number;
  filedChecksPass: boolean;
  checks: ApprovalQueueCheck[];
};
export type ApprovalQueueSummary = {
  waiting: number; overdue: number; oldestWaitingDays: number; ready: number; review: number;
};
export type ApprovalQueuePage = Page<ApprovalQueueItem> & {
  summary: ApprovalQueueSummary; total: number; pageSize: number;
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
export type ApprovalDecisionPage = Page<ApprovalDecisionRow> & { total: number; pageSize: number };

export type ApprovalSelection = { id: number; expectedRevision: number };
export type ApprovalOutcome = {
  id: number;
  reference: string;
  outcome: "approved" | "skipped";
  reason: string | null;
};

export type BulkApprovalResult = { approved: number; skipped: number; items: ApprovalOutcome[] };
export type ApprovalCheckResult = Pick<RequestCheck, "result">;
