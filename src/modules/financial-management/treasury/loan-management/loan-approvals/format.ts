import { daysSince } from "./pht";
import type { LoanStatus } from "./types";

/** "pending approval", "approved and waiting for its money" — reads inside a sentence. */
export function statusNoun(status: LoanStatus): string {
  switch (status) {
    case "PENDING_APPROVAL":
      return "pending approval";
    case "PENDING_RELEASE":
      return "approved and waiting for its money";
    case "REJECTED":
      return "rejected";
    case "CURRENT":
      return "already released and running";
    case "OVERDUE":
      return "already released and overdue";
    case "PAID_OFF":
      return "paid off";
    case "PREPAID":
      return "prepaid in full";
    default:
      return "past the approval stage";
  }
}

/** Days the submission has sat in the queue. */
export function daysWaiting(submittedAt: string | null): number {
  if (!submittedAt) return 0;
  return Math.max(0, daysSince(submittedAt));
}
