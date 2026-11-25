"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { transactionMoney } from "@/modules/financial-management/treasury/bank-reconciliation/utils/transactionDisplay";
import { GroupedBars, HBars, LineChart } from "../components/charts";
import { EmptyState, Panel, Tile } from "../components/ui";
import { formatDate } from "../format";
import type { DashboardSection, DashboardSummary, DashboardUnavailable, DashboardWorkItem } from "./dashboard-types";

const money = (amount: string) => transactionMoney(amount, "PHP").replace(/^-/, "−");
const signedMoney = (amount: string) => amount.startsWith("-") || amount === "0.00" ? money(amount) : `+${money(amount)}`;
const workLabels: Record<DashboardWorkItem["kind"], string> = {
  membership: "Membership", loan: "Loan", withdrawal: "Withdrawal", release: "Release", clearance: "Clearance",
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

function DashboardTile<T>({ label, section, format }: {
  label: string;
  section: DashboardSection<T>;
  format: (value: T) => { value: ReactNode; detail: string; alert?: boolean };
}) {
  if ("data" in section) return <Tile label={label} {...format(section.data)} />;
  return <Tile label={label} value="—" detail={section.message} />;
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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <DashboardTile label="Members" section={members} format={data => ({
        value: data.active, detail: `${data.applying} applying · ${data.notJoined} not yet joined`,
      })} />
      <DashboardTile label="Total savings" section={savings} format={data => ({
        value: money(data.total), detail: `${signedMoney(data.lastMonthChange)} in ${prior.name}`,
      })} />
      <DashboardTile label="Loan receivables" section={portfolio} format={data => ({
        value: money(data.receivables), detail: `${data.activeLoans} active loans`,
      })} />
      <DashboardTile label={`Loan collections, ${prior.label}`} section={moneyIn} format={data => ({
        value: money(data.loanPayments[4]), detail: `${money(data.loanPayments[5])} so far in ${current.name}`,
      })} />
      <DashboardTile label="Past due" section={portfolio} format={data => ({
        value: money(data.pastDue), detail: `${data.pastDuePercent}% of receivables · ${money(data.penalties)} penalties`,
        alert: data.pastDue !== "0.00",
      })} />
      <DashboardTile label="Needs action" section={work} format={data => ({
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

    <div className="grid gap-4 xl:grid-cols-3">
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
      <DashboardPanel title="Waiting for you" section={work} empty="Nothing waiting." onRetry={onRetry}
        href={links.approvals} linkLabel="All approvals"
        display={data => data.waiting.length ? (
          <Table aria-label="Waiting for you">
            <TableBody>
              {data.waiting.map(row => {
                const label = row.kind === "release" ? `Release ${row.reference}` : workLabels[row.kind];
                return (
                  <TableRow key={`${row.kind}-${row.id}`}>
                    <TableCell className="whitespace-normal">
                      {row.href ? <DashboardLink href={row.href}>{label}</DashboardLink> : <p className="font-medium">{label}</p>}
                      <p className="text-xs text-muted-foreground">
                        {row.member}{row.date ? ` · ${formatDate(row.date)}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-right font-mono">{row.amount === null ? "—" : money(row.amount)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : <EmptyState>Nothing waiting.</EmptyState>} />
    </div>

    <Panel title="Recent transactions"
      actions={"data" in recentTransactions && links.journal ? <DashboardLink href={links.journal}>Open journal</DashboardLink> : undefined}>
      <Table aria-label="Recent transactions">
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead><TableHead>Member</TableHead><TableHead>Type</TableHead>
            <TableHead>Channel</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {"data" in recentTransactions && recentTransactions.state === "ready" ? recentTransactions.data.map(row => (
            <TableRow key={row.id}>
              <TableCell>{formatDate(row.date)}</TableCell>
              <TableCell>{row.member}</TableCell>
              <TableCell>{row.type}</TableCell>
              <TableCell>{row.channel}</TableCell>
              <TableCell className="font-mono text-xs">{row.reference}</TableCell>
              <TableCell className="text-right font-mono">{signedMoney(row.amount)}</TableCell>
            </TableRow>
          )) : <TableRow>
            <TableCell colSpan={6} className="whitespace-normal">
              {"data" in recentTransactions ? <EmptyState>No posted transactions yet.</EmptyState>
                : <Unavailable section={recentTransactions} onRetry={onRetry} />}
            </TableCell>
          </TableRow>}
        </TableBody>
      </Table>
    </Panel>
  </>;
}

export default function DashboardModule() {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; data?: DashboardSummary; error?: string }>();
  const current = result?.attempt === attempt ? result : undefined;
  const retry = () => setAttempt(value => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/fm/cooperative/dashboard", { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (controller.signal.aborted) return;
        setResult(response.ok ? { attempt, data: body } : {
          attempt, error: typeof body?.message === "string" ? body.message : "Could not load the Dashboard.",
        });
      } catch {
        if (!controller.signal.aborted) setResult({ attempt, error: "Could not load the Dashboard." });
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  return (
    <main className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6" aria-busy={!current}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          {current?.data && <p className="mt-1 text-sm text-muted-foreground">
            Savings, loans and collections as of {formatDate(current.data.asOf)} · Next payroll cutoff {formatDate(current.data.nextCutoff)}.
          </p>}
        </div>
        <Button type="button" size="sm" variant="outline" onClick={retry} disabled={!current}>
          <RefreshCw className="size-4" /> Refresh
        </Button>
      </header>
      {!current && <DashboardSkeleton />}
      {current?.error && <Unavailable section={{ state: "failed", message: current.error }} onRetry={retry} />}
      {current?.data && <DashboardContent summary={current.data} onRetry={retry} />}
    </main>
  );
}
