import { ArrowUpRight, CircleCheck, CircleX, Clock3, FilePenLine, RotateCcw, Send, ShieldCheck } from "lucide-react";

const approved = ["Approved", CircleCheck, "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"] as const;
const rejected = ["Rejected", CircleX, "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"] as const;
const returned = ["Returned", RotateCcw, "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200"] as const;
const pending = "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200";
const info = "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200";
const statuses = {
  APPROVED: approved, APPROVE: approved, REJECTED: rejected, REJECT: rejected,
  NEEDS_CORRECTION: returned, RETURN: returned, RETURNED: returned,
  AWAITING_DECISION: ["Awaiting decision", Clock3, pending],
  NEEDS_FINANCE_REVIEW: ["Finance review", ShieldCheck, pending],
  ESCALATED: ["Escalated", ArrowUpRight, pending],
  FINANCE_CLEAR: ["Finance cleared", ShieldCheck, info],
  SUBMIT: ["Submitted", Send, info],
  SUBMITTED: ["Submitted", Send, info],
  SAVE_DRAFT: ["Draft saved", FilePenLine, "border-border bg-muted text-muted-foreground"],
  DRAFT: ["Draft", FilePenLine, "border-border bg-muted text-muted-foreground"],
} as const;

export function ExpenseStatus({ value }: { value: string }) {
  const [label, Icon, colors] = statuses[value as keyof typeof statuses] ?? [value.replaceAll("_", " ").toLowerCase(), Clock3, "border-border bg-muted text-muted-foreground"];
  return <span className={`inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${colors}`}>
    <Icon aria-hidden="true" className="size-3.5 shrink-0" />{label}
  </span>;
}

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
export const expenseAmount = (amount: string | number) => peso.format(Number(amount));
