"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { date, peso } from "@/modules/financial-management/cooperative/members/format";
import { useLifecycleRead } from "../loans/lifecycle-client";
import type { readLoanDashboard } from "../server/dashboard";

const money = (value: string | null) => value === null ? "—" : peso(value);
const monthFormat = new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "Asia/Manila" });
const monthLabel = (month: string) => monthFormat.format(new Date(month + "-01T00:00:00Z"));

export function GovernmentLoansDashboard() {
  const [refresh, setRefresh] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const result = useLifecycleRead<Awaited<ReturnType<typeof readLoanDashboard>>>("/api/fm/government-loans/dashboard", refresh);
  const reload = () => setRefresh(value => value + 1);
  if (result?.error) return <div role="alert" className="space-y-3 rounded-xl border bg-card p-4">
    <h2 className="font-semibold">Government Loans overview is unavailable</h2>
    <p className="text-sm text-muted-foreground">{result.error}</p>
    <Button variant="outline" size="sm" onClick={reload}>Retry</Button>
  </div>;
  if (!result?.data) return <p role="status" className="rounded-xl border bg-card p-4 text-sm">Loading Government Loans overview…</p>;
  const data = result.data;
  const cards = [
    { label: "Active loans", value: data.activeLoans.toLocaleString("en-PH"), detail: "Verified enrollments with an open balance or schedule" },
    { label: "Monthly amortizations", value: peso(data.monthlyAmortizations), detail: "Expected regular deductions for " + monthLabel(data.month) },
    { label: "Withheld not yet remitted", value: peso(data.withheld), detail: data.payrollReceived
      ? "Confirmed withholding less approved remittance principal" : "Known balance · Awaiting Payroll for " + monthLabel(data.month),
      breakdown: data.agencyBalances.map(row => row.code + " " + peso(row.withheld)) },
    { label: "Late-remittance penalties", value: peso(data.penalties), detail: "Approved payments made in " + data.year },
  ];
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">As of {date(data.businessDate)} PHT · Open Payroll month {monthLabel(data.month)}</p>
      <Button variant="outline" size="sm" onClick={reload}>Refresh</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(card => <section key={card.label} className="space-y-1 rounded-xl border bg-card p-4 shadow-xs">
        <h2 className="text-sm font-medium text-muted-foreground">{card.label}</h2>
        <p className="break-words text-xl font-semibold tabular-nums">{card.value}</p>
        <p className="text-xs text-muted-foreground">{card.detail}</p>
        {!!card.breakdown?.length && <p className="text-xs text-muted-foreground">{card.breakdown.join(" · ")}</p>}
      </section>)}
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4 shadow-xs">
        <h2 className="font-semibold">Needs attention</h2>
        {data.alerts.length ? <ul className="divide-y">
          {(showAll ? data.alerts : data.alerts.slice(0, 5)).map(alert => <li key={alert.key}
            className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <div>
              <p className="font-medium">{alert.count > 1 ? alert.count.toLocaleString("en-PH") + " · " : ""}{alert.title}</p>
              {alert.detail && <p className="text-xs text-muted-foreground">{alert.detail}</p>}
            </div>
            {alert.href && <Button asChild variant="outline" size="sm"><Link href={alert.href}
              aria-label={"Open " + alert.title.toLowerCase()}>Open</Link></Button>}
          </li>)}
        </ul> : <p className="text-sm text-muted-foreground">Nothing outstanding.</p>}
        {data.alerts.length > 5 && <Button variant="outline" size="sm" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>
          {showAll ? "Show fewer" : "Show all " + data.alerts.length}
        </Button>}
      </section>
      <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4 shadow-xs">
        <h2 className="font-semibold">Remittance deadlines</h2>
        <Table>
          <TableHeader><TableRow><TableHead>Agency</TableHead><TableHead>Payroll month</TableHead>
            <TableHead className="text-right">Withheld</TableHead><TableHead>Due date</TableHead><TableHead>Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!data.deadlines.length && <TableRow><TableCell colSpan={5}>No deadlines to show.</TableCell></TableRow>}
            {data.deadlines.map(row => <TableRow key={row.key}>
              <TableCell>{row.agency}</TableCell><TableCell>{monthLabel(row.month)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(row.withheld)}</TableCell>
              <TableCell>{date(row.due)}</TableCell>
              <TableCell><Badge variant={row.status === "overdue" ? "destructive" : "outline"}>{row.label}</Badge></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </section>
    </div>
    <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4 shadow-xs">
      <h2 className="font-semibold">Active loans by program</h2>
      <Table>
        <TableHeader><TableRow><TableHead>Agency</TableHead><TableHead>Program</TableHead>
          <TableHead className="text-right">Loans</TableHead><TableHead className="text-right">Monthly amortization</TableHead>
          <TableHead className="text-right">Remaining amortizations (est.)</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {!data.programs.length && <TableRow><TableCell colSpan={5}>No active loans.</TableCell></TableRow>}
          {data.programs.map(row => <TableRow key={JSON.stringify([row.agencyId, row.program])}>
            <TableCell>{row.agency}</TableCell><TableCell>{row.program}</TableCell><TableCell className="text-right">{row.count}</TableCell>
            <TableCell className="text-right tabular-nums">{peso(row.amortization)}</TableCell>
            <TableCell className="text-right tabular-nums">{peso(row.remaining)}</TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">The agency’s statement of account provides the official balance.</p>
    </section>
  </div>;
}
