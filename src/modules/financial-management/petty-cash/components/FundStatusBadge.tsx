export const FUND_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  ACTIVE: "Active",
  REJECTED: "Rejected",
  CLOSED: "Closed",
};

function statusKey(status: string): string {
  return String(status ?? "").trim().toUpperCase();
}

export function fundStatusTone(status: string): string {
  const key = statusKey(status);
  if (key === "ACTIVE" || key === "APPROVED") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (key === "PENDING") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (key === "REJECTED") return "border-destructive/30 bg-destructive/10 text-destructive";
  return "border-border bg-muted text-muted-foreground";
}

export function fundStatusLabel(status: string): string {
  const key = statusKey(status);
  return FUND_STATUS_LABELS[key] || (key ? key.charAt(0) + key.slice(1).toLowerCase() : "Unknown");
}

export function FundStatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${fundStatusTone(status)}`}>{fundStatusLabel(status)}</span>;
}
