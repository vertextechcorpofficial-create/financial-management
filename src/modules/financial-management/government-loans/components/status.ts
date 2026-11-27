const tones = {
  green: "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  blue: "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  amber: "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  red: "border-transparent bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  gray: "border-transparent bg-muted text-muted-foreground",
} as const;

type StatusMeta = { tone: keyof typeof tones; label: string };

const statuses: Record<string, StatusMeta> = {
  DRAFT: { tone: "amber", label: "Draft" },
  REQUESTED: { tone: "blue", label: "Requested" },
  APPROVED: { tone: "green", label: "Approved" },
  REJECTED: { tone: "red", label: "Rejected" },
  CANCELLED: { tone: "gray", label: "Cancelled" },
  ENROLLED: { tone: "amber", label: "For verification" },
  RETURNED: { tone: "amber", label: "Returned for correction" },
  VERIFIED: { tone: "blue", label: "Verified · awaiting activation" },
  ACTIVATING: { tone: "blue", label: "Activation pending" },
  ACTIVE: { tone: "green", label: "Active" },
  AGENCY_DECLINED: { tone: "red", label: "Not approved by agency" },
  SUSPENDED: { tone: "amber", label: "Suspended" },
  FINAL_PAY_REQUESTED: { tone: "amber", label: "Final pay requested" },
  COMPLETED: { tone: "blue", label: "Completed" },
  RENEWED: { tone: "gray", label: "Renewed" },
  DEFAULTED: { tone: "red", label: "Defaulted" },
  WAITING: { tone: "blue", label: "Waiting" },
  READY: { tone: "green", label: "Ready" },
  REVIEW: { tone: "amber", label: "Needs review" },
  OVERDUE: { tone: "red", label: "Overdue" },
  OPEN: { tone: "amber", label: "Open" },
  IN_PROGRESS: { tone: "blue", label: "In progress" },
  RESOLVED: { tone: "green", label: "Resolved" },
  QUEUED: { tone: "amber", label: "Queued" },
  EXPORTED: { tone: "blue", label: "Exported" },
  ACKNOWLEDGED: { tone: "blue", label: "Acknowledged" },
  ACCEPTED: { tone: "green", label: "Accepted" },
  RETRYABLE: { tone: "amber", label: "Retry required" },
  NEEDS_REVIEW: { tone: "amber", label: "Needs review" },
  D: { tone: "green", label: "Deducted in full" },
  P: { tone: "amber", label: "Partial deduction" },
  F: { tone: "red", label: "Failed deduction" },
  X: { tone: "amber", label: "Final pay" },
  AWAITING: { tone: "blue", label: "Awaiting Payroll" },
  NO_RESULT: { tone: "gray", label: "No result" },
  awaiting_payroll: { tone: "blue", label: "Awaiting Payroll" },
  nothing: { tone: "gray", label: "Nothing to remit" },
  due: { tone: "blue", label: "Due" },
  overdue: { tone: "red", label: "Overdue" },
  pending: { tone: "blue", label: "Awaiting approval" },
  approved: { tone: "green", label: "Approved" },
  returned: { tone: "red", label: "Returned" },
  matched: { tone: "green", label: "Matched" },
  difference: { tone: "amber", label: "Difference" },
  missing: { tone: "gray", label: "Missing" },
  issues: { tone: "red", label: "Issues" },
  open: { tone: "blue", label: "Open" },
  closed: { tone: "gray", label: "Closed" },
  ready: { tone: "green", label: "Ready" },
  blocked: { tone: "red", label: "Blocked" },
  passed: { tone: "green", label: "Passed" },
  warning: { tone: "amber", label: "Warning" },
  failed: { tone: "red", label: "Failed" },
  PAID: { tone: "green", label: "Paid" },
  UNPAID: { tone: "amber", label: "Unpaid" },
  PARTIAL: { tone: "amber", label: "Partial" },
};

export function statusTone(status: string) {
  return tones[statuses[status]?.tone ?? "gray"];
}

export function statusLabel(status: string) {
  return statuses[status]?.label ?? status.replaceAll("_", " ");
}
