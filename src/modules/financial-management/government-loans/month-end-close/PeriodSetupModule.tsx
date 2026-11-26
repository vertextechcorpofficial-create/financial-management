"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { date } from "@/modules/financial-management/cooperative/members/format";
import { StatusChip } from "../components/ui";
import { useLifecycleCommand, useRetainedLifecycleRead } from "../loans/lifecycle-client";
import { PayrollCoveragePanel } from "./PayrollCoveragePanel";
import type { PeriodSetupView } from "./setup-types";

const endpoint = "/api/fm/government-loans/period-setup";
const monthLabel = (value: string) => new Intl.DateTimeFormat("en-PH", {
  month: "short", year: "numeric", timeZone: "Asia/Manila",
}).format(new Date(value + "-01T00:00:00Z"));

function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
    <span className="min-w-0 flex-1 whitespace-pre-wrap">{message}</span>
    <Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>
  </div>;
}

function PeriodSkeleton() {
  return <div className="space-y-4" aria-busy="true" aria-label="Loading period setup">
    <Skeleton className="h-7 w-48" />
    <Skeleton className="h-40 w-full rounded-xl" />
    <Skeleton className="h-64 w-full rounded-xl" />
    <Skeleton className="h-40 w-full rounded-xl" />
  </div>;
}

function PeriodSection({ data, onChanged }: { data: PeriodSetupView; onChanged: () => void }) {
  const [month, setMonth] = useState(data.openMonth ?? data.businessDate.slice(0, 7));
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [open, setOpen] = useState(false);
  const command = useLifecycleCommand();
  const changing = Boolean(data.openMonth);
  const blocked = changing && !data.canChange;
  const unchanged = data.openMonth === month;
  const canOpen = Boolean(month) && !blocked && !unchanged && (changing ? Boolean(reason.trim()) : data.canInitialize);

  function submit() {
    if (!canOpen || confirmation.trim() !== month) return;
    return command.run(endpoint, {
      action: changing ? "CHANGE_PERIOD" : "INITIALIZE_PERIOD",
      month, reason: reason.trim(), expectedOpenMonth: data.openMonth,
    }, () => { setOpen(false); setReason(""); setConfirmation(""); onChanged(); });
  }

  const counts = ([
    ["Payroll receipts", data.counts.receipts], ["Remittances", data.counts.remittances],
    ["Billing revisions", data.counts.billingRevisions], ["Payroll results", data.counts.payrollResults],
    ["Open loan requests", data.counts.openRequests], ["Loan-change instructions", data.counts.changeInstructions],
    ["Open Payroll handoffs", data.counts.openHandoffs],
  ] as [string, number][]).filter(([, value]) => value > 0);

  return <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5" aria-labelledby="period-setup">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="period-setup" className="text-base font-semibold">Open period</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Initialize the month that Enrollment, Billing, Remittances, Payroll results, and Close will use.
          After operations start, use Checklist &amp; close to advance the period.
        </p>
      </div>
      <StatusChip status={data.openMonth ? "active" : "draft"} label={data.openMonth ? monthLabel(data.openMonth) : "Not initialized"} />
    </div>

    <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      <div className="rounded-md border bg-muted/20 p-2">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Open month</dt>
        <dd className="mt-1 font-medium">{data.openMonth ? monthLabel(data.openMonth) : "Not set"}</dd>
      </div>
      <div className="rounded-md border bg-muted/20 p-2">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Business date</dt>
        <dd className="mt-1 font-medium">{date(data.businessDate)} PHT</dd>
      </div>
      <div className="rounded-md border bg-muted/20 p-2">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payroll coverage</dt>
        <dd className="mt-1 font-medium">{data.contract && data.contractMatchesOpenMonth ? "Saved" : "Missing"}</dd>
      </div>
      <div className="rounded-md border bg-muted/20 p-2">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Payroll receipt</dt>
        <dd className="mt-1 font-medium">{data.counts.receipts ? "Confirmed" : "Not confirmed"}</dd>
      </div>
    </dl>

    {data.warnings.map(warning => <p key={warning} role="status" className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
      {warning}
    </p>)}

    {blocked && <div role="alert" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
      <p className="font-medium">This period cannot be changed from setup.</p>
      <ul className="list-disc space-y-1 pl-5">
        {data.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}
      </ul>
      <p>Use <Link className="underline" href="?tab=close">Checklist &amp; close</Link> to advance the period after operations are complete.</p>
    </div>}

    {!!counts.length && <div className="flex flex-wrap gap-2 text-xs">
      {counts.map(([label, value]) => <span key={label} className="rounded-full border bg-muted/30 px-2 py-1">
        {label} <span className="font-semibold tabular-nums">{value}</span>
      </span>)}
    </div>}

    <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end">
      <label className="grid gap-1 text-sm">
        <span className="font-medium">{changing ? "New open month" : "Open month"}</span>
        <Input type="month" value={month} min="2000-01" max="2100-12"
          disabled={command.busy || blocked} onChange={event => setMonth(event.target.value)} />
      </label>
      {changing && <label className="grid gap-1 text-sm">
        <span className="font-medium">Reason for changing the period</span>
        <Textarea value={reason} maxLength={500} disabled={command.busy || blocked}
          onChange={event => setReason(event.target.value)} className="min-h-9" />
      </label>}
      <Button type="button" disabled={!canOpen || command.busy} onClick={() => setOpen(true)}>
        {changing ? (unchanged ? "Current period" : "Change period") : "Initialize period"}
      </Button>
    </div>
    {command.error && <p role="alert" className="text-sm text-destructive">{command.error}</p>}

    <AlertDialog open={open} onOpenChange={next => { if (!command.busy) setOpen(next); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{changing ? "Change the open period to " + monthLabel(month) + "?" : "Initialize " + monthLabel(month) + "?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {changing
              ? "This changes the month used by Enrollment, Billing, Remittances, Payroll results, and Close. It does not close the current period."
              : "This enables Enrollment, Billing, Remittances, Payroll results, and Close for this month."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="block space-y-1 text-sm">
          <span>Type <strong>{month}</strong> to confirm.</span>
          <Input value={confirmation} disabled={command.busy} onChange={event => setConfirmation(event.target.value)} placeholder={month} />
        </label>
        {command.error && <p role="alert" className="text-sm text-destructive">{command.error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={command.busy}>Cancel</AlertDialogCancel>
          <Button type="button" disabled={command.busy || confirmation.trim() !== month} onClick={() => void submit()}>
            {command.busy ? "Saving…" : changing ? "Change period" : "Initialize period"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}

function ReadinessSection({ data }: { data: PeriodSetupView }) {
  const rows = [
    { label: "Open period", ready: Boolean(data.openMonth), detail: data.openMonth ? monthLabel(data.openMonth) : "Not initialized" },
    { label: "Payroll coverage", ready: Boolean(data.contract && data.contractMatchesOpenMonth),
      detail: data.contract && data.contractMatchesOpenMonth ? data.contract.approvalReference : "Record the approved Payroll runs" },
    { label: "Payroll receipt", ready: data.counts.receipts > 0,
      detail: data.counts.receipts ? `${data.counts.receipts} confirmed receipt(s)` : "Not confirmed" },
    { label: "Active agencies", ready: data.readiness.agencies > 0, detail: `${data.readiness.agencies} active` },
    { label: "Verified loans", ready: data.readiness.activeLoans > 0, detail: `${data.readiness.activeLoans} active` },
  ];
  return <section className="space-y-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5" aria-labelledby="setup-readiness">
    <div>
      <h2 id="setup-readiness" className="text-base font-semibold">Setup readiness</h2>
      <p className="text-sm text-muted-foreground">A quick check before the month is used.</p>
    </div>
    <ul className="divide-y rounded-lg border">
      {rows.map(row => <li key={row.label} className="flex flex-wrap items-center gap-3 p-3 text-sm">
        {row.ready ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          : <CircleAlert className="size-4 shrink-0 text-amber-600" aria-hidden="true" />}
        <span className="min-w-0 flex-1 font-medium">{row.label}</span>
        <span className="text-muted-foreground">{row.detail}</span>
        <StatusChip status={row.ready ? "ready" : "open"} label={row.ready ? "Ready" : "Open"} />
      </li>)}
    </ul>
    <p className="text-xs text-muted-foreground">
      Agencies and loans are managed in their own workspaces. Return to <Link className="underline" href="?tab=close">Checklist &amp; close</Link> when setup is complete.
    </p>
  </section>;
}

export function PeriodSetupModule() {
  const [refresh, setRefresh] = useState(0);
  const loaded = useRetainedLifecycleRead<PeriodSetupView>(endpoint, refresh);
  const data = loaded?.data;
  const reload = () => setRefresh(value => value + 1);

  if (!data) {
    return <div className="space-y-4">
      {loaded?.error ? <LoadError message={loaded.error} retry={reload} /> : <PeriodSkeleton />}
    </div>;
  }

  const ready = Boolean(data.openMonth && data.contractMatchesOpenMonth);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Period setup</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Initialize the open period and record the Payroll coverage approved for it.
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={loaded?.pending} onClick={reload}>
        <RefreshCw className={cn("size-3.5", loaded?.pending && "animate-spin")} /> Refresh
      </Button>
    </div>

    {loaded?.error && <LoadError message={loaded.error} retry={reload} />}

    <div role="status" className={cn("flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm",
      ready ? "border-emerald-300 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
        : "border-amber-300 bg-amber-50/70 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200")}>
      {ready ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <AlertTriangle className="size-4" aria-hidden="true" />}
      <span className="font-medium">{ready ? "Period setup is ready." :
        data.openMonth ? "Period initialized. Payroll coverage still needs to be recorded." : "The open period is not initialized."}</span>
      {loaded?.pending && <span className="text-xs opacity-70">Refreshing…</span>}
    </div>

    <PeriodSection key={data.openMonth ?? "unset"} data={data} onChanged={reload} />
    <PayrollCoveragePanel key={(data.openMonth ?? "unset") + ":" + data.runs.totalRuns} data={data} onChanged={reload} />
    <ReadinessSection data={data} />
  </div>;
}
