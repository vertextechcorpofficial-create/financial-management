"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, Info, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { useRetainedLifecycleRead } from "../loans/lifecycle-client";
import type { readLoanDashboard } from "../server/dashboard";

type Dashboard = Awaited<ReturnType<typeof readLoanDashboard>>;
type Deadline = Dashboard["deadlines"][number];

const monthFormat = new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "Asia/Manila" });
const monthLabel = (month: string) => monthFormat.format(new Date(month + "-01T00:00:00Z"));

const severityMeta = {
  critical: { label: "Critical", badge: "destructive", icon: AlertTriangle,
    iconClass: "text-destructive", border: "border-l-destructive", badgeClass: "" },
  warning: { label: "Warning", badge: "outline", icon: CircleAlert,
    iconClass: "text-amber-600 dark:text-amber-400", border: "border-l-amber-500",
    badgeClass: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" },
  info: { label: "Info", badge: "secondary", icon: Info,
    iconClass: "text-muted-foreground", border: "border-l-border", badgeClass: "" },
} as const;

function deadlineTiming(days: number) {
  const value = Math.round(days);
  if (value === 0) return "Due today";
  return value > 0 ? `Due in ${value} day${value === 1 ? "" : "s"}` :
    `${Math.abs(value)} day${Math.abs(value) === 1 ? "" : "s"} overdue`;
}

function deadlineTone(status: Deadline["status"]) {
  if (status === "overdue" || status === "returned") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (status === "due") return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
  if (status === "pending") return "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300";
  if (status === "approved") return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200";
  if (status === "awaiting_payroll") return "bg-muted text-muted-foreground";
  return "";
}

function agencyTone(name: string) {
  const value = name.toLowerCase();
  if (value.includes("pag-ibig") || value.includes("hdmf")) return "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/40 dark:text-orange-300";
  if (value.includes("sss") || value.includes("social security")) return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300";
  if (value.includes("bank")) return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300";
  return "text-muted-foreground";
}

function AgencyBadge({ name }: { name: string }) {
  return <Badge variant="outline" className={agencyTone(name)}>{name}</Badge>;
}

type KpiCardData = {
  label: string; value: string; detail: string;
  breakdown?: { label: string; value: string; title?: string }[]; more?: number;
  tone?: "default" | "warning" | "critical" | "accent";
};

function KpiCard({ card }: { card: KpiCardData }) {
  return <section className={cn("flex min-w-0 flex-col justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs",
    card.tone === "accent" && "border-primary/40 bg-primary/5",
    card.tone === "warning" && "border-amber-300/70 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20",
    card.tone === "critical" && "border-destructive/40 bg-destructive/5")}>
    <div className="min-w-0 space-y-1">
      <h2 className="text-sm font-medium text-muted-foreground">{card.label}</h2>
      <p className="break-words text-xl font-semibold tabular-nums">{card.value}</p>
      <p className="text-xs text-muted-foreground">{card.detail}</p>
      {!!card.breakdown?.length && <div className="flex flex-wrap gap-1.5 pt-1">
        {card.breakdown.map(item => <span key={item.label} title={item.title}
          className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{item.label}</span>
          <span className="tabular-nums">{item.value}</span>
        </span>)}
        {!!card.more && <span className="self-center text-[11px] text-muted-foreground">+{card.more} more</span>}
      </div>}
    </div>
  </section>;
}

function DashboardSkeleton() {
  return <div className="space-y-4" aria-busy="true" aria-label="Loading Government Loans overview">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-9 w-24 rounded-md" />
    </div>
    <Skeleton className="h-4 w-96 max-w-full" />
    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map(key =>
      <Skeleton key={key} className="h-32 rounded-xl" />)}</div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
    <Skeleton className="h-56 rounded-xl" />
  </div>;
}

export function GovernmentLoansDashboard() {
  const [refresh, setRefresh] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const { data, error, pending } = useRetainedLifecycleRead<Dashboard>("/api/fm/government-loans/dashboard", refresh);
  const reload = () => setRefresh(value => value + 1);

  if (!data) {
    if (error) return <div role="alert" className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Government Loans overview is unavailable</h2>
      <p className="text-sm text-muted-foreground">{error}</p>
      <Button variant="outline" size="sm" onClick={reload}>Retry</Button>
    </div>;
    return <DashboardSkeleton />;
  }

  const severityRank = { critical: 0, warning: 1, info: 2 } as const;
  const alerts = [...data.alerts].sort((left, right) => severityRank[left.severity] - severityRank[right.severity]);
  const visibleAlerts = showAll ? alerts : alerts.slice(0, 5);
  const agencyCounts = new Map<string, number>();
  for (const row of data.programs) {
    const key = row.code || row.agency;
    agencyCounts.set(key, (agencyCounts.get(key) ?? 0) + row.count);
  }
  const cards: KpiCardData[] = [
    { label: "Active loans", value: data.activeLoans.toLocaleString("en-PH"),
      detail: data.activeEmployees
        ? `${data.activeEmployees.toLocaleString("en-PH")} employee${data.activeEmployees === 1 ? "" : "s"} with an open schedule`
        : "Verified enrollments with an open schedule",
      breakdown: [...agencyCounts].slice(0, 3).map(([label, count]) => ({ label, value: String(count) })),
      more: Math.max(0, agencyCounts.size - 3), tone: "accent" },
    { label: "Monthly amortizations", value: peso(data.monthlyAmortizations),
      detail: "Expected regular deductions for " + monthLabel(data.month) },
    { label: "Withheld not yet remitted", value: peso(data.withheld),
      detail: data.payrollReceived ? "Confirmed withholding less approved remittance principal" :
        "Known balance - Payroll is still awaiting " + monthLabel(data.month),
      breakdown: data.agencyBalances.slice(0, 3).map(row => ({ label: row.code, value: peso(row.withheld), title: row.agency })),
      more: Math.max(0, data.agencyBalances.length - 3), tone: data.withheld !== "0.00" ? "warning" : "default" },
    { label: "Late-remittance penalties", value: peso(data.penalties),
      detail: data.penalties === "0.00" ? `No approved late payments in ${data.year}` : `Approved late payments in ${data.year}`,
      tone: data.penalties !== "0.00" ? "warning" : "default" },
  ];

  return <div className="space-y-4" aria-busy={pending}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="outline">Open month {monthLabel(data.month)}</Badge>
        <Badge variant={data.payrollReceived ? "secondary" : "destructive"}>
          {data.payrollReceived ? "Payroll received" : "Payroll awaiting"}
        </Badge>
        <span className="text-muted-foreground">As of {date(data.businessDate)} PHT</span>
        <span className="text-xs text-muted-foreground" aria-live="polite">{pending ? "Refreshing…" : `Updated ${dateTime(data.refreshedAt)} PHT`}</span>
      </div>
      <Button variant="outline" size="sm" onClick={reload} disabled={pending}>
        <RefreshCw className={cn(pending && "animate-spin")} /> Refresh
      </Button>
    </div>

    <p className="max-w-3xl text-sm text-muted-foreground">
      Employee loans deducted through payroll and remitted to SSS, Pag-IBIG, and partner lenders.
    </p>

    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <span>Could not refresh the overview: {error}</span>
      <Button variant="outline" size="sm" onClick={reload}>Retry</Button>
    </div>}

    {!data.payrollReceived && <div role="status" className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">Payroll for {monthLabel(data.month)} is still missing</p>
          <p className="text-amber-900/80 dark:text-amber-200/80">Remittance amounts stay provisional until the Payroll receipt is confirmed.</p>
        </div>
      </div>
    </div>}

    <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
      {cards.map(card => <KpiCard key={card.label} card={card} />)}
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Needs attention</h2>
            <p className="text-xs text-muted-foreground">{alerts.length
              ? `${alerts.length} item${alerts.length === 1 ? "" : "s"} requiring review`
              : "All clear for this month"}</p>
          </div>
          {alerts.length > 5 && <Button variant="outline" size="sm" aria-expanded={showAll}
            aria-controls="government-loans-alerts" onClick={() => setShowAll(value => !value)}>
            {showAll ? "Show fewer" : `Show all ${alerts.length}`}
          </Button>}
        </div>
        {alerts.length ? <ul id="government-loans-alerts" className="space-y-2">
          {visibleAlerts.map(alert => {
            const meta = severityMeta[alert.severity];
            const Icon = meta.icon;
            return <li key={alert.key} className={cn("rounded-lg border border-l-4 p-3", meta.border)}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <Icon className={cn("mt-0.5 size-4 shrink-0", meta.iconClass)} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-medium">{alert.count > 1 ? alert.count.toLocaleString("en-PH") + " - " : ""}{alert.title}</p>
                    {alert.detail && <p className="text-xs text-muted-foreground">{alert.detail}</p>}
                  </div>
                </div>
                <Badge variant={meta.badge} className={meta.badgeClass}>{meta.label}</Badge>
              </div>
            </li>;
          })}
        </ul> : <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" /> Nothing outstanding for this month.
        </div>}
      </section>

      <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4 shadow-xs">
        <div>
          <h2 className="font-semibold">Remittance deadlines</h2>
          <p className="text-xs text-muted-foreground">Open and prior Payroll months</p>
        </div>
        <Table>
          <caption className="sr-only">Remittance deadlines for the open and prior Payroll months</caption>
          <TableHeader><TableRow><TableHead>Agency</TableHead><TableHead>Payroll month</TableHead>
            <TableHead className="text-right">Withheld</TableHead><TableHead>Due date</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!data.deadlines.length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
              No deadlines to show.
            </TableCell></TableRow>}
            {data.deadlines.map(row => <TableRow key={row.key}>
              <TableCell><AgencyBadge name={row.agency} /></TableCell>
              <TableCell>{monthLabel(row.month)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.withheld === null
                ? <span className="text-xs text-muted-foreground">Awaiting Payroll</span> : peso(row.withheld)}</TableCell>
              <TableCell><div className="whitespace-nowrap">{date(row.due)}</div>
                <div className="text-xs text-muted-foreground">{deadlineTiming(row.daysUntilDue)}</div></TableCell>
              <TableCell><Badge variant="outline" className={deadlineTone(row.status)}>{row.label}</Badge></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </section>
    </div>

    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4 shadow-xs">
      <div>
        <h2 className="font-semibold">Active loans by program</h2>
        <p className="text-xs text-muted-foreground">Estimated remaining balance is based on scheduled amortizations.</p>
      </div>
      <Table>
        <caption className="sr-only">Active loans grouped by agency and program</caption>
        <TableHeader><TableRow><TableHead>Agency</TableHead><TableHead>Program</TableHead>
          <TableHead className="text-right">Loans</TableHead><TableHead className="text-right">Monthly amortization</TableHead>
          <TableHead className="text-right">Estimated remaining balance</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {!data.programs.length && <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
            No active loans.
          </TableCell></TableRow>}
          {data.programs.map(row => <TableRow key={row.agencyId + ":" + row.program}>
            <TableCell><AgencyBadge name={row.agency} /></TableCell>
            <TableCell>{row.program}</TableCell><TableCell className="text-right">{row.count}</TableCell>
            <TableCell className="text-right tabular-nums">{peso(row.amortization)}</TableCell>
            <TableCell className="text-right tabular-nums">{peso(row.remaining)}</TableCell>
          </TableRow>)}
        </TableBody>
        {!!data.programs.length && <TableFooter><TableRow>
          <TableCell colSpan={2}>Total</TableCell>
          <TableCell className="text-right">{data.programTotals.count.toLocaleString("en-PH")}</TableCell>
          <TableCell className="text-right tabular-nums">{peso(data.programTotals.amortization)}</TableCell>
          <TableCell className="text-right tabular-nums">{peso(data.programTotals.remaining)}</TableCell>
        </TableRow></TableFooter>}
      </Table>
      <p className="text-xs text-muted-foreground">The agency&apos;s statement of account provides the official balance.</p>
    </section>
  </div>;
}
