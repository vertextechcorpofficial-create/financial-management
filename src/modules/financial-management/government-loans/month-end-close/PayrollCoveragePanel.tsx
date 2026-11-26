"use client";

import { useState } from "react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { date, dateTime, peso } from "@/modules/financial-management/cooperative/members/format";
import { MetricCard } from "../components/ui";
import { useLifecycleCommand } from "../loans/lifecycle-client";
import type { PayrollCoverageValidation, PeriodSetupView } from "./setup-types";

const endpoint = "/api/fm/government-loans/period-setup";
const monthLabel = (value: string) => new Intl.DateTimeFormat("en-PH", {
  month: "short", year: "numeric", timeZone: "Asia/Manila",
}).format(new Date(value + "-01T00:00:00Z"));

function Metric({ label, value }: { label: string; value: string }) {
  return <MetricCard label={label} value={value} />;
}

export function PayrollCoveragePanel({ data, onChanged }: { data: PeriodSetupView; onChanged: () => void }) {
  const allRuns = data.runs.cutoffs.flatMap(cutoff => cutoff.runs);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(
    data.contract ? data.contract.cutoffs.flatMap(cutoff => cutoff.runIds) : allRuns.map(run => run.id)));
  const [approvalReference, setApprovalReference] = useState(data.contract?.approvalReference ?? "");
  const [preview, setPreview] = useState<PayrollCoverageValidation>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const [clearReason, setClearReason] = useState("");
  const command = useLifecycleCommand();
  const clearCommand = useLifecycleCommand();
  const savedRunCount = data.contract
    ? new Set(data.contract.cutoffs.flatMap(cutoff => [...cutoff.runIds, ...cutoff.supersededRunIds])).size
    : 0;
  const selectedCutoffs = data.runs.cutoffs
    .map(cutoff => ({ cutoff: cutoff.cutoff, runIds: cutoff.runs.filter(run => selected.has(run.id)).map(run => run.id) }))
    .filter(cutoff => cutoff.runIds.length);
  const selectedRuns = selectedCutoffs.reduce((total, cutoff) => total + cutoff.runIds.length, 0);
  const allSelected = allRuns.length > 0 && allRuns.every(run => selected.has(run.id));
  const sameCoverage = Boolean(preview && data.contractHash === preview.contractHash);
  const replacing = Boolean(data.contract) && !sameCoverage;
  const canReview = Boolean(data.openMonth && approvalReference.trim() && selectedRuns && !command.busy);
  const canSave = Boolean(preview && data.openMonth && !sameCoverage &&
    (!preview.warnings.length || acknowledged) && (!replacing || reason.trim()) && !command.busy);

  function toggleRun(id: number) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(undefined);
    setAcknowledged(false);
  }

  async function review() {
    if (!canReview) return;
    setPreview(undefined);
    setAcknowledged(false);
    await command.run(endpoint, {
      action: "PREVIEW_COVERAGE", approvalReference: approvalReference.trim(), cutoffs: selectedCutoffs,
    }, async response => setPreview(await response.json() as PayrollCoverageValidation));
  }

  async function save() {
    if (!preview || !data.openMonth || !canSave) return;
    await command.run(endpoint, {
      action: "SAVE_COVERAGE", approvalReference: approvalReference.trim(), cutoffs: selectedCutoffs,
      contractHash: preview.contractHash, token: preview.token, acknowledgeWarnings: acknowledged,
      reason: reason.trim(), expectedOpenMonth: data.openMonth, expectedContractHash: data.contractHash,
    }, () => {
      setApprovalReference(""); setPreview(undefined); setAcknowledged(false); setReason(""); onChanged();
    });
  }

  async function clear() {
    if (!data.openMonth || !clearReason.trim()) return;
    await clearCommand.run(endpoint, {
      action: "CLEAR_CONTRACT", reason: clearReason.trim(),
      expectedOpenMonth: data.openMonth, expectedContractHash: data.contractHash,
    }, () => { setClearOpen(false); setClearReason(""); onChanged(); });
  }

  return <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5" aria-labelledby="payroll-coverage">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="payroll-coverage" className="text-base font-semibold">Payroll coverage</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Select the Payroll runs approved for this month. The app reads the posted Payroll items and calculates the coverage.
        </p>
      </div>
      <Badge variant="outline" className={data.contract && data.contractMatchesOpenMonth
        ? "border-emerald-300 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300"
        : "border-amber-300 text-amber-700 dark:border-amber-900 dark:text-amber-300"}>
        {data.contract && data.contractMatchesOpenMonth ? "Recorded" : "Not recorded yet"}
      </Badge>
    </div>

    {data.contractError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      {data.contractError}
    </p>}

    {data.contract && <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">Recorded coverage · {monthLabel(data.contract.month)}</p>
          <p className="text-sm text-muted-foreground">Payroll approval {data.contract.approvalReference}</p>
        </div>
        {data.counts.receipts === 0 && <Button type="button" variant="outline" size="sm" disabled={clearCommand.busy}
          onClick={() => setClearOpen(true)}>Remove coverage</Button>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Metric label="Payroll cutoffs" value={String(data.contract.cutoffs.length)} />
        <Metric label="Payroll runs" value={String(savedRunCount)} />
        <Metric label="Employees covered" value={String(data.contract.employeeControls.length)} />
        <Metric label="Total deductions" value={peso((data.contract.employeeControls.reduce((sum, row) => sum + Math.round(Number(row.actual) * 100), 0) / 100).toFixed(2))} />
        <Metric label="Final pay / failed" value={String(data.contract.outcomes.length)} />
        <Metric label="Payroll settled" value={data.contract.settled ? "Yes" : "No"} />
      </div>
      {!!data.contract.outcomes.length && <details className="rounded-md border p-2 text-sm">
        <summary className="cursor-pointer font-medium">Final pay / failed deductions ({data.contract.outcomes.length})</summary>
        <ul className="mt-2 space-y-1">
          {data.contract.outcomes.map(outcome => <li key={outcome.status + ":" + outcome.payrollLoanId}>
            {outcome.status === "X" ? "Final pay" : "Not deducted"} · Payroll loan #{outcome.payrollLoanId}
            {outcome.balance ? " · " + peso(outcome.balance) : ""} · {outcome.reference}
          </li>)}
        </ul>
      </details>}
      {!data.contractMatchesOpenMonth && <p role="status" className="rounded-md border border-amber-300 bg-amber-50/60 p-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
        The recorded coverage is for {monthLabel(data.contract.month)}, but the open month is {data.openMonth ? monthLabel(data.openMonth) : "not set"}.
      </p>}
      {data.counts.receipts > 0 && <p className="text-xs text-muted-foreground">
        A Payroll receipt already exists for this month. Replacing coverage requires a new receipt review or correction.
      </p>}
    </div>}

    {!data.openMonth && <p role="status" className="rounded-lg border p-3 text-sm text-muted-foreground">
      Initialize the open period before recording Payroll coverage.
    </p>}

    {data.openMonth && !allRuns.length && <p role="status" className="rounded-lg border p-3 text-sm text-muted-foreground">
      Payroll has not posted runs for {monthLabel(data.openMonth)} yet. Ask Payroll to post the runs, then refresh.
    </p>}

    {data.openMonth && !!allRuns.length && <div className={cn("space-y-3 rounded-lg border p-3", command.busy && "opacity-60")}>
      <div>
        <h3 className="text-sm font-semibold">{data.contract ? "Replace coverage" : "Record coverage"}</h3>
        <p className="text-sm text-muted-foreground">
          Select the run(s) Payroll approved. Use the Payroll approval reference from the same approval.
        </p>
      </div>
      <label className="block max-w-md space-y-1 text-sm">
        <span className="font-medium">Payroll approval reference</span>
        <Input value={approvalReference} maxLength={200} disabled={command.busy}
          placeholder="e.g. PAYROLL-2026-11-001" onChange={event => { setApprovalReference(event.target.value); setPreview(undefined); }} />
      </label>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-10"><Checkbox aria-label="Include all posted Payroll runs" checked={allSelected}
              onCheckedChange={value => { setSelected(value === true ? new Set(allRuns.map(run => run.id)) : new Set()); setPreview(undefined); }} /></TableHead>
            <TableHead>Cutoff</TableHead><TableHead>Payroll run</TableHead><TableHead>Posted</TableHead>
            <TableHead className="text-right">Deductions</TableHead><TableHead className="text-right">Employees</TableHead>
          </TableRow></TableHeader>
          <TableBody>{data.runs.cutoffs.flatMap(cutoff => cutoff.runs.map(run => <TableRow key={run.id}>
            <TableCell><Checkbox aria-label={"Include Payroll run " + run.id} checked={selected.has(run.id)}
              onCheckedChange={() => toggleRun(run.id)} /></TableCell>
            <TableCell>{date(run.cutoff)}</TableCell>
            <TableCell>#{run.id}</TableCell>
            <TableCell>{run.postedAt ? dateTime(run.postedAt) : "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{peso(run.total)}</TableCell>
            <TableCell className="text-right tabular-nums">{run.employees}</TableCell>
          </TableRow>))}</TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={!canReview} onClick={() => void review()}>
          {command.busy ? "Reviewing…" : "Review coverage"}
        </Button>
        <span className="text-xs text-muted-foreground">{selectedRuns} run(s) selected</span>
      </div>
      {command.error && <p role="alert" className="text-sm text-destructive">{command.error}</p>}
    </div>}

    {preview && <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">Coverage review · {monthLabel(preview.summary.month)}</p>
        <Badge variant="outline">{preview.warnings.length ? `${preview.warnings.length} warning(s)` : "Ready to record"}</Badge>
      </div>
      <p className="text-sm text-muted-foreground">Payroll approval {preview.summary.approvalReference}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Metric label="Payroll cutoffs" value={String(preview.summary.cutoffs.length)} />
        <Metric label="Payroll runs" value={String(preview.summary.runIds.length)} />
        <Metric label="Employees covered" value={String(preview.summary.controls)} />
        <Metric label="Total deductions" value={peso(preview.summary.controlTotal)} />
        <Metric label="Final pay / failed" value={String(preview.summary.outcomes)} />
        <Metric label="Refund payouts" value={String(preview.summary.refunds)} />
      </div>
      {!!preview.summary.outcomeDetails.length && <details className="rounded-md border p-2 text-sm">
        <summary className="cursor-pointer font-medium">Final pay / failed deductions ({preview.summary.outcomeDetails.length})</summary>
        <ul className="mt-2 space-y-1">
          {preview.summary.outcomeDetails.map(outcome => <li key={outcome.status + ":" + outcome.payrollLoanId}>
            {outcome.status === "X" ? "Final pay" : "Not deducted"} · Payroll loan #{outcome.payrollLoanId}
            {outcome.balance ? " · " + peso(outcome.balance) : ""} · {outcome.reference}
          </li>)}
        </ul>
      </details>}
      {preview.warnings.length > 0 && <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/20">
        <p className="font-medium text-amber-900 dark:text-amber-200">Payroll receipt confirmation will be blocked until these are resolved:</p>
        <ul className="list-disc space-y-1 pl-5 text-amber-900/90 dark:text-amber-100/90">
          {preview.warnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul>
        <label className="flex items-start gap-2">
          <Checkbox checked={acknowledged} onCheckedChange={value => setAcknowledged(value === true)} className="mt-0.5" />
          <span>I reviewed these warnings and confirm this is the coverage approved by Payroll.</span>
        </label>
      </div>}
      {replacing && <label className="block space-y-1 text-sm">
        <span className="font-medium">Reason for replacing the recorded coverage</span>
        <Input value={reason} maxLength={500} disabled={command.busy} onChange={event => setReason(event.target.value)} />
      </label>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={!canSave} onClick={() => void save()}>
          {command.busy ? "Recording…" : "Record coverage"}
        </Button>
        <Button type="button" variant="ghost" disabled={command.busy}
          onClick={() => { setPreview(undefined); setAcknowledged(false); }}>Cancel</Button>
        {!canSave && <span className="text-xs text-muted-foreground">
          {sameCoverage ? "This matches the recorded coverage." :
            preview.warnings.length && !acknowledged ? "Acknowledge the warnings to continue." :
              replacing && !reason.trim() ? "Enter a reason for replacing the coverage." : ""}
        </span>}
      </div>
    </div>}

    {clearCommand.error && <p role="alert" className="text-sm text-destructive">{clearCommand.error}</p>}
    <AlertDialog open={clearOpen} onOpenChange={open => { if (!clearCommand.busy) setClearOpen(open); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove the recorded Payroll coverage?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the coverage for {data.openMonth ? monthLabel(data.openMonth) : "the open month"}. A Payroll receipt cannot already exist for this month.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Reason</span>
          <Input value={clearReason} maxLength={500} disabled={clearCommand.busy} onChange={event => setClearReason(event.target.value)} />
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={clearCommand.busy}>Cancel</AlertDialogCancel>
          <Button type="button" variant="destructive" disabled={clearCommand.busy || !clearReason.trim()} onClick={() => void clear()}>
            {clearCommand.busy ? "Removing…" : "Remove coverage"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
