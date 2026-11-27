"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GroupedBars, HBars, LineChart } from "../components/charts";
import { EmptyState, Panel } from "../components/ui";
import { MetricCard } from "../../members/components";
import { daysBetween, formatDate, money as formatMoney } from "../format";
import type {
  DashboardSection,
  DashboardSummary,
  DashboardTransaction,
  DashboardUnavailable,
  DashboardWorkItem,
} from "./dashboard-types";

const money = (amount: string | number) => formatMoney(Number(amount)).replace(/^-/, "−");
const signedMoney = (amount: string) => amount.startsWith("-") || amount === "0.00" ? money(amount) : `+${money(amount)}`;
const workLabels: Record<DashboardWorkItem["kind"], string> = {
  membership: "Membership",
  loan: "Loan",
  withdrawal: "Withdrawal",
  release: "Release",
  clearance: "Clearance",
};
const workTones: Record<DashboardWorkItem["kind"], string> = {
  membership: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300",
  loan: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  withdrawal: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  release: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  clearance: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300",
};
const depositColor = "var(--chart-1, #2563eb)";
const paymentColor = "var(--chart-2, #ea580c)";

function DashboardLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="text-sm text-primary underline-offset-4 hover:underline">{children}</Link>;
}

function Unavailable({ section, onRetry }: { section: DashboardUnavailable; onRetry: () => void }) {
  if (section.state === "pending") return <EmptyState>{section.message}</EmptyState>;
  return <div role="alert" className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
    <p className="text-sm text-destructive">{section.message}</p>
    <Button type="button" size="sm" variant="outline" onClick={onRetry}>Retry</Button>
  </div>;
}

function DashboardMeta({ summary, updatedAt }: { summary: DashboardSummary; updatedAt?: Date }) {
  const days = daysBetween(summary.asOf, summary.nextCutoff);
  const cutoffText = days === 0 ? "today" : days > 0
    ? `in ${days} day${days === 1 ? "" : "s"}`
    : `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  const cutoffTone = days < 0
    ? "border-destructive/40 text-destructive"
    : days <= 3 ? "border-amber-500/40 text-amber-700 dark:text-amber-300" : "";

  return <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
    <Badge variant="outline" className="gap-1.5 font-normal">
      <CalendarDays className="size-3.5" aria-hidden />As of {formatDate(summary.asOf)}
    </Badge>
    <Badge variant="outline" className={`gap-1.5 font-normal ${cutoffTone}`}>
      <CalendarClock className="size-3.5" aria-hidden />Next payroll cutoff {formatDate(summary.nextCutoff)} · {cutoffText}
    </Badge>
    {updatedAt && <span className="text-muted-foreground" aria-live="polite">
      Updated {updatedAt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}
    </span>}
  </div>;
}

function DashboardMetric<T>({ label, section, icon, href, tone, format }: {
  label: string;
  section: DashboardSection<T>;
  icon: ComponentType<{ className?: string }>;
  href?: string;
  tone?: "emerald" | "sky" | "amber" | "rose" | "slate";
  format: (value: T) => { value: ReactNode; detail: string; alert?: boolean };
}) {
  if ("data" in section) {
    const content = <MetricCard icon={icon} label={label} tone={tone} {...format(section.data)} />;
    return href
      ? <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40">{content}</Link>
      : content;
  }
  return <MetricCard icon={icon} label={label} value="—" detail={section.message} tone="slate" />;
}

function DashboardPanel<T>({ title, description, section, empty, href, linkLabel, onRetry, display }: {
  title: string;
  description?: string;
  section: DashboardSection<T>;
  empty: string;
  href?: string;
  linkLabel?: string;
  onRetry: () => void;
  display: (value: T) => ReactNode;
}) {
  const hasData = "data" in section;
  return (
    <Panel title={title} description={description} actions={hasData && href ? <DashboardLink href={href}>{linkLabel}</DashboardLink> : undefined}>
      {hasData
        ? section.state === "empty" ? <EmptyState>{empty}</EmptyState> : display(section.data)
        : <Unavailable section={section} onRetry={onRetry} />}
    </Panel>
  );
}

function DashboardSkeleton() {
  return <div className="space-y-4" aria-hidden="true">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border bg-muted/30" />)}
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: 2 }, (_, index) => <div key={index} className="h-64 animate-pulse rounded-xl border bg-muted/30" />)}
    </div>
    <div className="grid gap-4 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-64 animate-pulse rounded-xl border bg-muted/30" />)}
    </div>
    <div className="h-64 animate-pulse rounded-xl border bg-muted/30" />
  </div>;
}

function RecentTransactions({ section, journalHref, onRetry }: {
  section: DashboardSection<DashboardTransaction[]>;
  journalHref?: string;
  onRetry: () => void;
}) {
  if (!("data" in section)) return <Panel title="Recent transactions">
    <Unavailable section={section} onRetry={onRetry} />
  </Panel>;

  const rows = section.data;
  return <Panel title="Recent transactions" actions={journalHref ? <DashboardLink href={journalHref}>Open journal</DashboardLink> : undefined}>
    {!rows.length ? <EmptyState>No posted transactions yet.</EmptyState> : <>
      <div className="hidden overflow-x-auto md:block">
        <Table aria-label="Recent transactions">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead><TableHead>Member</TableHead><TableHead>Type</TableHead>
              <TableHead>Channel</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap">{formatDate(row.date)}</TableCell>
              <TableCell>{row.member}</TableCell>
              <TableCell>{row.type}</TableCell>
              <TableCell>{row.channel}</TableCell>
              <TableCell className="font-mono text-xs">{row.reference}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{signedMoney(row.amount)}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
      <ul aria-label="Recent transactions" className="divide-y md:hidden">
        {rows.map(row => <li key={row.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{row.member}</p>
            <p className="text-xs text-muted-foreground">{formatDate(row.date)} · {row.type} · {row.channel}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{row.reference}</p>
          </div>
          <p className="shrink-0 font-mono text-sm tabular-nums">{signedMoney(row.amount)}</p>
        </li>)}
      </ul>
    </>}
  </Panel>;
}

function DashboardContent({ summary, onRetry }: { summary: DashboardSummary; onRetry: () => void }) {
  const { months, members, savings, portfolio, moneyIn, work, recentTransactions, links } = summary;
  const first = months[0];
  const prior = months[4];
  const current = months[5];
  const year = current.key.slice(0, 4);
  const currentRange = first.key.startsWith(year)
    ? `${first.label}–${current.label} ${year}`
    : `${first.label} ${first.key.slice(0, 4)}–${current.label} ${year}`;

  return <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <DashboardMetric label="Members" section={members} icon={Users} tone="sky" href={links.members} format={data => ({
        value: data.active, detail: `${data.applying} applying · ${data.notJoined} not yet joined`,
      })} />
      <DashboardMetric label="Total savings" section={savings} icon={PiggyBank} tone="emerald" format={data => ({
        value: money(data.total), detail: `${signedMoney(data.lastMonthChange)} in ${prior.name}`,
      })} />
      <DashboardMetric label="Loan receivables" section={portfolio} icon={Landmark} tone="sky" href={links.loans} format={data => ({
        value: money(data.receivables), detail: `${data.activeLoans} active loans`,
      })} />
      <DashboardMetric label={`Loan collections, ${prior.label}`} section={moneyIn} icon={TrendingUp} tone="emerald" href={links.journal} format={data => ({
        value: money(data.loanPayments[4]), detail: `${money(data.loanPayments[5])} so far in ${current.name}`,
      })} />
      <DashboardMetric label="Past due" section={portfolio} icon={AlertTriangle} tone="rose" href={links.aging} format={data => ({
        value: money(data.pastDue), detail: `${data.pastDuePercent}% of receivables · ${money(data.penalties)} penalties`,
        alert: data.pastDue !== "0.00",
      })} />
      <DashboardMetric label="Needs action" section={work} icon={ClipboardList} tone="amber" href={links.approvals} format={data => ({
        value: data.approvals + data.releases + data.clearances,
        detail: `${data.approvals} approvals · ${data.releases} for release · ${data.clearances} clearances`,
      })} />
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <DashboardPanel title="Total member savings" description={`Balance at month end, ${currentRange} (${current.label} to date)`}
        section={savings} empty="No savings movements yet." onRetry={onRetry}
        display={data => <LineChart points={months.map((month, index) => ({
          label: month.label, value: Number(data.balances[index]), displayValue: money(data.balances[index]),
        }))} />} />
      <DashboardPanel title="Money in by month" section={moneyIn} empty="No deposits or loan payments in this period." onRetry={onRetry}
        display={data => <>
          <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: depositColor }} />Savings deposits</span>
            <span><span className="mr-1 inline-block size-2.5 rounded-sm" style={{ background: paymentColor }} />Loan payments</span>
          </div>
          <GroupedBars labels={months.map(month => month.label)} series={[
            { name: "Savings deposits", values: data.deposits.map(Number), displayValues: data.deposits.map(money), color: depositColor },
            { name: "Loan payments", values: data.loanPayments.map(Number), displayValues: data.loanPayments.map(money), color: paymentColor },
          ]} />
        </>} />
    </div>

    <div className="grid items-start gap-4 xl:grid-cols-3">
      <DashboardPanel title="Receivables by product" section={portfolio} empty="No active loans." onRetry={onRetry}
        display={data => <HBars rows={data.products.map(row => ({
          label: row.label, value: Number(row.amount), displayValue: money(row.amount), detail: `(${row.loans})`,
        }))} />} />
      <DashboardPanel title="Past-due aging" section={portfolio} empty="No past-due installments." onRetry={onRetry}
        href={links.aging} linkLabel="Aging report"
        display={data => data.pastDue === "0.00" ? <EmptyState>No past-due installments.</EmptyState> : <>
          <HBars color="bg-orange-600" rows={data.aging.map(row => ({
            label: row.label, value: Number(row.amount), displayValue: money(row.amount),
          }))} />
          <p className="mt-2 text-xs text-muted-foreground">Unpaid installments by days late.</p>
        </>} />
      <DashboardPanel title="Waiting for you" description="Oldest items first." section={work} empty="Nothing waiting." onRetry={onRetry}
        href={links.approvals} linkLabel="All approvals"
        display={data => data.waiting.length ? (
          <ul aria-label="Waiting for you" className="divide-y">
            {data.waiting.map(row => <li key={`${row.kind}-${row.id}`} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${workTones[row.kind]}`}>{workLabels[row.kind]}</span>
                  {row.href ? <DashboardLink href={row.href}>{row.reference}</DashboardLink> : <span className="font-medium">{row.reference}</span>}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {row.member}{row.date ? ` · ${formatDate(row.date)}` : ""}
                </p>
              </div>
              <p className="shrink-0 font-mono text-sm tabular-nums">{row.amount === null ? "—" : money(row.amount)}</p>
            </li>)}
          </ul>
        ) : <EmptyState>Nothing waiting.</EmptyState>} />
    </div>

    <RecentTransactions section={recentTransactions} journalHref={links.journal} onRetry={onRetry} />
  </>;
}

export default function DashboardModule() {
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<DashboardSummary>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date>();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    async function load() {
      try {
        const response = await fetch("/api/fm/cooperative/dashboard", { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (response.ok) {
          setData(body);
          setUpdatedAt(new Date());
        } else {
          setError(typeof body?.message === "string" ? body.message : "Could not load the Dashboard.");
        }
      } catch {
        if (!controller.signal.aborted) setError("Could not load the Dashboard.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  const refresh = () => setAttempt(value => value + 1);

  return <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-busy={loading}>
    <section className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-xs sm:p-5">
      <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-emerald-500/5 blur-2xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <LayoutDashboard className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cooperative</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Savings, loans and collections across the cooperative.</p>
            {data && <DashboardMeta summary={data} updatedAt={updatedAt} />}
          </div>
        </div>
        <Button type="button" className="w-full shrink-0 sm:w-auto" onClick={refresh} disabled={loading} aria-label="Refresh dashboard">
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />Refresh
        </Button>
      </div>
    </section>
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
      <AlertTriangle className="size-4 shrink-0 text-destructive" />
      <p className="min-w-0 flex-1 text-sm text-destructive">{error}</p>
      <Button type="button" size="sm" variant="outline" onClick={refresh} disabled={loading}>Retry</Button>
    </div>}
    {loading && !data && <DashboardSkeleton />}
    {data && <DashboardContent summary={data} onRetry={refresh} />}
  </main>;
}
