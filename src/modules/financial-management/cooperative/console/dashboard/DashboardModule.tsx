"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowDownLeft, CalendarDays, CheckCircle2, Clock3, HandCoins, LayoutDashboard,
  PiggyBank, Receipt, RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { GroupedBars, HBars, LineChart } from "../components/charts";
import { Panel } from "../components/ui";
import { formatDate } from "../format";
import type { DashboardSection, DashboardSummary, DashboardUnavailable } from "./dashboard-types";
import {
  DashboardAlert, DashboardEmpty, DashboardKpis, DashboardLink, DashboardSkeleton, WorkKindBadge,
  money, signedMoney,
} from "./DashboardUi";

const depositColor = "var(--chart-1, #2563eb)";
const paymentColor = "var(--chart-2, #ea580c)";
const updatedTime = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

function Unavailable({ section, onRetry }: { section: DashboardUnavailable; onRetry: () => void }) {
  if (section.state === "pending") return <DashboardEmpty icon={Clock3} title={section.message} compact />;
  return <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
    <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
    <p className="min-w-0 flex-1 text-sm text-destructive">{section.message}</p>
    <Button type="button" size="sm" variant="outline" onClick={onRetry}>Retry</Button>
  </div>;
}

function DashboardPanel<T>({ title, description, section, empty, href, linkLabel, actions, onRetry, display }: {
  title: string;
  description?: string;
  section: DashboardSection<T>;
  empty: ReactNode;
  href?: string;
  linkLabel?: string;
  actions?: ReactNode;
  onRetry: () => void;
  display: (value: T) => ReactNode;
}) {
  const hasData = "data" in section;
  const headerActions = hasData && (actions || (href && linkLabel))
    ? <div className="flex flex-wrap items-center gap-2">
      {actions}
      {href && linkLabel && <DashboardLink href={href}>{linkLabel}</DashboardLink>}
    </div>
    : undefined;
  return (
    <Panel title={title} description={description} actions={headerActions}>
      {hasData
        ? section.state === "empty" ? empty : display(section.data)
        : <Unavailable section={section} onRetry={onRetry} />}
    </Panel>
  );
}

function DashboardContent({ summary, onRetry }: { summary: DashboardSummary; onRetry: () => void }) {
  const { months, savings, portfolio, moneyIn, work, recentTransactions, links } = summary;
  const first = months[0];
  const current = months[months.length - 1];
  const currentRange = first && current
    ? first.key.startsWith(current.key.slice(0, 4))
      ? `${first.label}–${current.label} ${current.key.slice(0, 4)}`
      : `${first.label} ${first.key.slice(0, 4)}–${current.label} ${current.key.slice(0, 4)}`
    : "the last six months";
  const workData = "data" in work ? work.data : undefined;
  const totalWaiting = workData ? workData.approvals + workData.releases + workData.clearances : 0;
  const visibleWaiting = (workData?.waiting ?? []).slice(0, 6);
  const remainingWaiting = Math.max(0, totalWaiting - visibleWaiting.length);
  const recentData = "data" in recentTransactions ? recentTransactions.data : undefined;
  const waitingEmpty = <DashboardEmpty icon={CheckCircle2} title="Nothing waiting"
    description="Approvals, releases, and clearances will appear here." />;
  const agingEmpty = <DashboardEmpty icon={CheckCircle2} title="No past-due installments"
    description="Every installment is current." />;

  return <>
    <DashboardKpis summary={summary} />

    <div className="grid gap-4 xl:grid-cols-2">
      <DashboardPanel title="Total member savings"
        description={`Balance at month end, ${currentRange}${current ? ` (${current.label} to date)` : ""}`}
        section={savings}
        empty={<DashboardEmpty icon={PiggyBank} title="No savings movements yet" description="Posted savings activity will appear here." />}
        onRetry={onRetry}
        display={data => <LineChart points={months.map((month, index) => ({
          label: month.label,
          value: Number(data.balances[index] ?? "0.00"),
          displayValue: money(data.balances[index] ?? "0.00"),
        }))} />} />
      <DashboardPanel title="Money in by month" section={moneyIn}
        empty={<DashboardEmpty icon={ArrowDownLeft} title="No deposits or loan payments" description="Nothing was posted in this period." />}
        onRetry={onRetry}
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

    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <DashboardPanel title="Receivables by product" section={portfolio}
        empty={<DashboardEmpty icon={HandCoins} title="No active loans" description="Active loan balances will appear here." />}
        onRetry={onRetry}
        display={data => data.products.length ? <HBars rows={data.products.map(row => ({
          label: row.label.split(" / ")[0], value: Number(row.amount), displayValue: money(row.amount), detail: `(${row.loans})`,
        }))} /> : <DashboardEmpty icon={HandCoins} title="No active loans" description="Active loan balances will appear here." />} />
      <DashboardPanel title="Past-due aging" section={portfolio} empty={agingEmpty}
        href={links.aging} linkLabel="Aging report" onRetry={onRetry}
        display={data => data.pastDue === "0.00" ? agingEmpty : <>
          <HBars color="bg-orange-600" rows={data.aging.map(row => ({
            label: row.label, value: Number(row.amount), displayValue: money(row.amount),
          }))} />
          <p className="mt-2 text-xs text-muted-foreground">Unpaid installments by days late.</p>
        </>} />
      <DashboardPanel title="Waiting for you" section={work} empty={waitingEmpty}
        actions={workData ? <Badge variant="outline" className="font-mono text-[11px] tabular-nums">{totalWaiting} waiting</Badge> : undefined}
        href={links.approvals} linkLabel="All approvals" onRetry={onRetry}
        display={() => visibleWaiting.length ? <>
          <Table>
            <TableBody>
              {visibleWaiting.map(row => (
                <TableRow key={`${row.kind}-${row.id}`}>
                  <TableCell className="whitespace-normal py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <WorkKindBadge kind={row.kind} />
                      {row.href
                        ? <DashboardLink href={row.href} className="font-mono text-xs">{row.reference}</DashboardLink>
                        : <span className="font-mono text-xs">{row.reference}</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{row.member} · {formatDate(row.date)}</p>
                  </TableCell>
                  <TableCell className="text-right align-top font-mono text-sm tabular-nums">
                    {row.amount === null ? "—" : money(row.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {remainingWaiting > 0 && <p className="pt-2 text-xs text-muted-foreground">+{remainingWaiting} more waiting</p>}
        </> : waitingEmpty} />
    </div>

    <Panel title="Recent transactions"
      actions={recentData && links.journal ? <DashboardLink href={links.journal}>Open journal</DashboardLink> : undefined}>
      {recentData && recentData.length > 0 ? <>
        <ul className="divide-y md:hidden">
          {recentData.map(row => (
            <li key={row.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.type}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.member} · {formatDate(row.date)}</p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{row.channel} · {row.reference}</p>
              </div>
              <span className={cn(
                "shrink-0 font-mono text-sm tabular-nums",
                row.amount.startsWith("-") ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400",
              )}>{signedMoney(row.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead>Member</TableHead><TableHead>Type</TableHead>
                <TableHead className="hidden lg:table-cell">Channel</TableHead>
                <TableHead className="hidden lg:table-cell">Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentData.map(row => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell className="max-w-40 truncate">{row.member}</TableCell>
                  <TableCell className="max-w-40 truncate">{row.type}</TableCell>
                  <TableCell className="hidden lg:table-cell">{row.channel}</TableCell>
                  <TableCell className="hidden font-mono text-xs lg:table-cell">{row.reference}</TableCell>
                  <TableCell className={cn(
                    "text-right font-mono tabular-nums",
                    row.amount.startsWith("-") ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400",
                  )}>{signedMoney(row.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </> : "data" in recentTransactions
        ? <DashboardEmpty icon={Receipt} title="No posted transactions yet" description="Posted Cooperative journal entries will appear here." />
        : <Unavailable section={recentTransactions} onRetry={onRetry} />}
    </Panel>
  </>;
}

export default function DashboardModule() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; data?: DashboardSummary; error?: string }>();
  const [updatedAt, setUpdatedAt] = useState<Date>();
  const loading = result?.attempt !== attempt;
  const summary = result?.data;
  const error = result?.attempt === attempt ? result?.error : undefined;
  const refresh = () => setAttempt(value => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/fm/cooperative/dashboard", { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!active) return;
        if (response.ok) {
          setResult({ attempt, data: body });
          setUpdatedAt(new Date());
        } else {
          setResult(previous => ({
            attempt,
            data: previous?.data,
            error: typeof body?.message === "string" ? body.message : "Could not load the Dashboard.",
          }));
        }
      } catch {
        if (active && !controller.signal.aborted) {
          setResult(previous => ({ attempt, data: previous?.data, error: "Could not load the Dashboard." }));
        }
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt]);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") setAttempt(value => value + 1);
    };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, []);

  return (
    <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-busy={loading}>
      <section className="relative overflow-hidden rounded-xl border bg-card p-4 shadow-xs sm:p-5">
        <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-emerald-500/5 blur-2xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <LayoutDashboard className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cooperative</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
                <Badge variant="outline" className="font-medium">Read-only</Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Savings, loans, collections, and pending work across the Cooperative.
              </p>
              {(summary || loading) && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {summary ? <>
                  <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1">
                    <CalendarDays className="size-3.5" aria-hidden="true" /> Today · {formatDate(summary.asOf)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1">
                    <Clock3 className="size-3.5" aria-hidden="true" /> Next payroll cutoff · {formatDate(summary.nextCutoff)}
                  </span>
                  {updatedAt && <span className="inline-flex items-center gap-1.5 px-1">
                    <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> Updated {updatedTime.format(updatedAt)}
                  </span>}
                </> : <>
                  <Skeleton className="h-6 w-40 rounded-md" />
                  <Skeleton className="h-6 w-52 rounded-md" />
                </>}
              </div>}
            </div>
          </div>
          <Button type="button" variant="outline" className="w-full shrink-0 sm:w-auto" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            {loading ? (summary ? "Refreshing…" : "Loading…") : "Refresh"}
          </Button>
        </div>
      </section>

      {!summary && loading && <DashboardSkeleton />}
      {!summary && !loading && error && <div className="rounded-xl border bg-card p-4">
        <DashboardEmpty icon={AlertTriangle} title="Dashboard unavailable" description={error}
          action={<Button type="button" size="sm" variant="outline" onClick={refresh}>Retry</Button>} />
      </div>}
      {summary && <>
        {error && <DashboardAlert message={error} onRetry={refresh} />}
        <DashboardContent summary={summary} onRetry={refresh} />
      </>}
    </main>
  );
}
