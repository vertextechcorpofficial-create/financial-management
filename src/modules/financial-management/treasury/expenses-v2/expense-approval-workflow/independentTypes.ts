export interface WorkflowAttachment {
  id: string; name: string; type: string; size: number; proof: string;
}
export interface IndependentExpenseForm {
  expenseDate: string; amount: string; category: string; purpose: string;
  payee: string; requestedCompany: string; department: string; attachments: WorkflowAttachment[];
  specialDetails?: Record<string, string>;
  executionMode?: "DUMMY";
}
export interface IndependentExpenseSnapshot extends IndependentExpenseForm {
  kind: "INDEPENDENT_EXPENSE";
  reference: string;
  status: "DRAFT" | "NEEDS_FINANCE_REVIEW" | "NEEDS_CORRECTION" | "ESCALATED" | "AWAITING_DECISION" | "APPROVED" | "REJECTED";
  companyOwnership: "UNVERIFIED";
  fingerprint: string;
  dummyReview?: DummyReview;
  dummyLastOfficerId?: number;
  dummyHandoff?: { id: string; state: "RECORDED_NOT_DISBURSED"; amount: string };
  requesterName?: string;
}
export interface IndependentExpenseEvent {
  id: string; case_id: string; revision: number; company_id: number;
  requester_id: number; actor_id: number; actor_name: string;
  request_key: string; payload_hash: string; created_at: string;
  snapshot: IndependentExpenseSnapshot; action: string; reason: string;
}
import type { DummyReview } from "./domain/dummyWorkflow";
