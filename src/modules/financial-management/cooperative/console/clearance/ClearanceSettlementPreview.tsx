"use client";

import { useState } from "react";
import {
  AlertTriangle, HandCoins, Landmark, RefreshCw, Scale, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { MetricCard } from "../../members/components";
import { dateTime, peso } from "../../members/format";
import type { SettlementPreview } from "../../server/clearance-settlement";
import type { SettlementRecord, SettlementReversalRecord } from "../../server/clearance-records";
import { transactionLabels } from "../../transactions/entries";
import { Kv, Panel, StatusChip } from "../components/ui";
import { formatDate } from "../format";
import { useClearanceData, useClearanceMutation } from "./useClearanceData";

const amount = (value: string | null) => value === null ? "—" : peso(value);
const rateText = (value: string | null) => value === null ? "Rate required" : `${value.replace(/\.0+$|(\.\d*?[1-9])0+$/, "$1")}%`;

export function ClearanceSettlementPreview({ path, revision, canConfirm, onRefresh, onOpenDocuments }: {
  path: string;
  revision: number;
  canConfirm: boolean;
  onRefresh: (message?: string) => void;
  onOpenDocuments?: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const mutation = useClearanceMutation(error => {
    if (error.code === "CLEARANCE_STALE" || error.code === "CLEARANCE_READ_ONLY") onRefresh(error.message);
  });
  const { data, error, loading, reload } = useClearanceData<SettlementPreview>(path + "/settlement-preview");
  const stale = data !== undefined && data.caseRevision !== revision;
  const preview = !loading && !error && !stale ? data : undefined;
  const pendingPay = preview?.funding !== null && preview?.funding !== undefined && preview.funding.finalPayApplied === null;

  return <>
    <Panel title="Settlement preview"
      description={preview
        ? `${preview.estimated ? "Estimate for" : "Balances as of"} ${formatDate(preview.separationDate)} · Calculated ${dateTime(preview.calculatedAt)}`
        : "Calculated from the current savings, loans, and verified final pay."}
      actions={<Button type="button" variant="outline" size="sm" disabled={loading || mutation.busy} onClick={() => reload()}>
        <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Refresh preview
      </Button>}>
      {loading && !preview && <SettlementPreviewSkeleton />}
      {error && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertTriangle className="size-4 shrink-0" />
        <p className="min-w-0 flex-1">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => reload()}>Retry</Button>
      </div>}
      {stale && <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="size-4 shrink-0" />
        <p className="min-w-0 flex-1">The clearance changed. Refresh the preview to see the latest draft.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => onRefresh()}>Refresh preview</Button>
      </div>}
      {preview && <>
        {preview.annualRate === null && <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Rate required. Add the approved {preview.year}{" "}annual savings rate in Policies → Savings &amp; membership to calculate the dividend and offsets.
        </p>}
        {pendingPay && <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">Verify final pay to calculate the remaining recovery. The amounts applied from savings and dividend are shown below.</span>
          {onOpenDocuments && <Button type="button" size="sm" variant="outline" onClick={onOpenDocuments}>Open documents</Button>}
        </p>}
        <SettlementSummaryCards preview={preview} pendingPay={pendingPay} />
        {preview.issues.length > 0 && <IssueList issues={preview.issues} onOpenDocuments={onOpenDocuments} />}
      </>}
    </Panel>

    {preview && <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Savings & dividend">
          <Kv rows={[
            ["Posted savings at separation", peso(preview.savings)],
            [`Approved annual savings rate · ${preview.year}`, rateText(preview.annualRate)],
            ["Elapsed year (30-day months)", `${preview.elapsed} / 360 days`],
            ["Pro-rated dividend estimate", amount(preview.dividend)],
            ...(preview.funding ? [["Savings plus dividend", peso(preview.funding.available)] as [string, string]] : []),
          ]} />
        </Panel>
        <Panel title="Application of funds">
          {preview.funding ? <Kv rows={[
            ["Applied from savings and dividend", peso(preview.funding.savingsApplied)],
            ["Debt after savings and dividend", peso(preview.funding.remainingAfterSavings)],
            ["Applied from verified final pay", pendingPay ? "Pending verification" : amount(preview.funding.finalPayApplied)],
            ["Savings refund due", peso(preview.funding.refund), "total"],
            ["Debt still owed after final pay", pendingPay ? "Pending verification" : amount(preview.funding.remaining), "total"],
          ]} /> : <p className="text-sm text-muted-foreground">
            {preview.annualRate === null
              ? "Set the annual savings rate to calculate the application of funds."
              : "No loan offset is required at separation."}
          </p>}
        </Panel>
      </div>

      <Panel title="Unpaid loans" description="Interest and penalties are calculated to the separation date.">
        {preview.loans.length ? <div className="overflow-x-auto rounded-xl border [&>[data-slot=table-container]]:overflow-visible"
          role="region" aria-label="Unpaid loan settlement amounts" tabIndex={0}>
          <Table>
            <TableHeader>
              <TableRow>
                {["Loan", "Principal", "Interest due", "Accrued interest", "Goods installments", "Penalties",
                  "Total owed", "From savings + dividend", "From final pay", "Recovered", "Still owed"].map((label, index) => (
                    <TableHead key={label} className={cn("whitespace-nowrap", index === 0 ? undefined : "text-right")}>{label}</TableHead>
                  ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.loans.map(loan => <TableRow key={loan.id}>
                <TableCell className="font-medium">{loan.reference}</TableCell>
                {[loan.principal, loan.dueInterest, loan.accruedInterest, loan.goodsInstallments, loan.penalties, loan.debt,
                  loan.savingsApplied, loan.finalPayApplied, loan.recovered, loan.remaining].map((value, index) => (
                    <TableCell key={index} className="whitespace-nowrap text-right font-mono tabular-nums">{amount(value)}</TableCell>
                  ))}
              </TableRow>)}
            </TableBody>
          </Table>
        </div> : <p className="text-sm text-muted-foreground">No unpaid loans at separation.</p>}
      </Panel>

      {preview.withdrawals.length > 0 && <Panel title="Pending withdrawals to cancel" description="These requests will be cancelled when the settlement posts.">
        <ul className="divide-y rounded-xl border">
          {preview.withdrawals.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span className="font-mono">{row.reference}</span>
            <span className="font-mono tabular-nums">{peso(row.amount)}</span>
          </li>)}
        </ul>
      </Panel>}

      {preview.later.length > 0 && <Panel title="Activity after separation" description="Reconcile these items before posting.">
        <ul className="divide-y rounded-xl border">
          {preview.later.map((item, index) => <li key={`${item.reference}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>{formatDate(item.date)} · {item.source}</span>
            <span className="font-mono text-xs text-muted-foreground">{item.reference}</span>
          </li>)}
        </ul>
      </Panel>}

      {preview.allocations.length > 0 && <details className="rounded-xl border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Installment allocations <span className="ml-1 text-xs font-normal text-muted-foreground">({preview.allocations.length})</span></summary>
        <div className="mt-3 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              {["Loan", "Installment", "Applied from", "Principal", "Interest or markup", "Penalty", "Applied"].map(label => <TableHead key={label}>{label}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>{preview.allocations.map(row => <TableRow key={`${row.loanId}-${row.installmentNo}-${row.source}`}>
              <TableCell>{preview.loans.find(loan => loan.id === row.loanId)?.reference}</TableCell>
              <TableCell>{row.installmentNo}</TableCell>
              <TableCell>{row.source === "SAVINGS" ? "Savings + dividend" : "Final pay"}</TableCell>
              {[row.principal, row.interest, row.penalty, row.total].map((value, index) => <TableCell key={index} className="font-mono tabular-nums">{peso(value)}</TableCell>)}
            </TableRow>)}</TableBody>
          </Table>
        </div>
      </details>}

      {preview.journalPreview.length > 0 && <Panel title="Proposed journal entries" description="Posted when the settlement is confirmed.">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              {["Entry", "Debit account", "Credit account", "Amount"].map(label => <TableHead key={label}>{label}</TableHead>)}
            </TableRow></TableHeader>
            <TableBody>{preview.journalPreview.flatMap(journal => journal.pairs.map((pair, index) => <TableRow key={`${journal.category}-${index}`}>
              <TableCell>{transactionLabels[journal.category] ?? journal.category}</TableCell>
              <TableCell>{pair.debit}</TableCell><TableCell>{pair.credit}</TableCell>
              <TableCell className="font-mono tabular-nums">{peso(pair.amount)}</TableCell>
            </TableRow>))}</TableBody>
          </Table>
        </div>
      </Panel>}

      <Panel title="Confirm settlement" description="Posting closes the membership and writes the settlement journals.">
        {preview.issues.length > 0 && <p role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 p-2.5 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Resolve the requirements above before posting.
        </p>}
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input className="mt-1" type="checkbox" checked={confirmed}
              disabled={mutation.busy || !canConfirm || !preview.confirmable} onChange={event => setConfirmed(event.target.checked)} />
            I reviewed this settlement with the member and HR.
          </label>
          {mutation.error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-sm text-destructive">{mutation.error.message}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={mutation.busy || !canConfirm || !preview.confirmable || !confirmed} onClick={async () => {
              const result = await mutation.save(path, "POST", {
                action: "settle", fingerprint: preview.fingerprint, reviewedWithMemberAndHr: true,
              });
              if (result) onRefresh(`${result.reference} posted and membership closed.`);
            }}>{mutation.busy ? "Posting…" : "Settle & close membership"}</Button>
            <p className="text-xs text-muted-foreground">
              {preview.confirmable ? "This action cannot be undone from this screen." : "Posting is unavailable until the requirements above are resolved."}
            </p>
          </div>
        </div>
      </Panel>
    </>}
  </>;
}

function SettlementSummaryCards({ preview, pendingPay }: { preview: SettlementPreview; pendingPay: boolean }) {
  const funding = preview.funding;
  const loanCount = preview.loans.length;
  const noDebt = preview.debt === "0.00";
  const stillOwed = funding && !pendingPay && funding.remaining !== null ? funding.remaining : null;
  const savingsValue = funding ? peso(funding.available) : preview.annualRate === null ? "Rate required" : "—";
  const owedValue = funding
    ? (pendingPay || funding.remaining === null ? "Pending" : peso(funding.remaining))
    : peso(preview.debt);
  const owedDetail = noDebt ? "No unpaid loans" : !funding ? "Before savings and final pay"
    : pendingPay ? "Waiting for final pay"
      : stillOwed && stillOwed !== "0.00" ? "Endorsed for collection" : "Debt fully covered";
  const owedTone = noDebt ? "slate" : !funding ? "amber" : stillOwed && stillOwed !== "0.00" ? "amber" : "slate";
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <MetricCard icon={Wallet} label="Savings + dividend" value={savingsValue}
      detail={preview.annualRate === null ? "Set the annual rate" : "Available for offset"}
      tone={preview.annualRate === null && !funding ? "amber" : "emerald"} />
    <MetricCard icon={HandCoins} label="Unpaid loan debt" value={peso(preview.debt)}
      detail={loanCount ? `${loanCount} unpaid loan${loanCount === 1 ? "" : "s"}` : "No unpaid loans"}
      tone={noDebt ? "slate" : "rose"} />
    <MetricCard icon={Landmark} label="Savings refund due" value={funding ? peso(funding.refund) : "—"}
      detail={preview.annualRate === null && !funding ? "Set the annual rate" : "After loan recovery"} tone="sky" />
    <MetricCard icon={Scale} label="Still owed" value={owedValue}
      detail={owedDetail} tone={owedTone} />
  </div>;
}

function IssueList({ issues, onOpenDocuments }: { issues: string[]; onOpenDocuments?: () => void }) {
  const needsDocuments = issues.some(issue => /final-pay|documents/i.test(issue));
  return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
    <p className="font-medium">Posting requirements</p>
    <ul className="mt-1 list-disc space-y-1 pl-5">
      {issues.map(issue => <li key={issue}>{issue}</li>)}
    </ul>
    {needsDocuments && onOpenDocuments && <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onOpenDocuments}>Open documents</Button>}
  </div>;
}

function SettlementPreviewSkeleton() {
  return <div className="space-y-3" aria-hidden="true">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl border bg-muted/40" />)}
    </div>
    <div className="h-40 animate-pulse rounded-xl border bg-muted/30" />
  </div>;
}

export function PostedClearance({ settlement, reversal }: { settlement: SettlementRecord; reversal: SettlementReversalRecord | null }) {
  return <>
    <Panel title="Posted settlement" description={`${settlement.postedByName} · ${dateTime(settlement.postedAt)}`}
      actions={<StatusChip status={reversal ? "REVERSED" : "COMPLETED"} label={reversal ? "Reversed" : "Posted"} />}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Wallet} label="Savings before closure" value={peso(settlement.savingsBefore)} detail="Members' savings" tone="slate" />
        <MetricCard icon={HandCoins} label="Dividend credited" value={peso(settlement.dividend)} detail="Pro-rated at separation" tone="emerald" />
        <MetricCard icon={Landmark} label="Refund payable" value={peso(settlement.refund)} detail="After loan and final-pay offset" tone="sky" />
        <MetricCard icon={Scale} label="Endorsed for collection" value={peso(settlement.remaining)}
          detail={settlement.remaining === "0.00" ? "Debt fully covered" : "Unpaid after settlement"}
          tone={settlement.remaining === "0.00" ? "slate" : "rose"} alert={settlement.remaining !== "0.00"} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-muted/20 p-3">
          <Kv rows={[
            ["Accounting status", reversal ? "Reversed" : "Posted"],
            ["Membership", "Separated"],
            ["Posting date", formatDate(settlement.date)],
            ["Savings applied", peso(settlement.savingsApplied)],
            ["Final pay applied", peso(settlement.finalPayApplied)],
            ["Withdrawals cancelled", settlement.withdrawals.map(row => row.reference).join(", ") || "—"],
          ]} />
        </div>
        <div className="rounded-xl border bg-muted/20 p-3">
          <Kv rows={settlement.loans.length
            ? settlement.loans.map(loan => [loan.reference, `${peso(loan.recovered)} recovered · ${peso(loan.remaining)} owed`] as [string, string])
            : [["Loans settled", "No unpaid loans at separation"]]} />
        </div>
      </div>
    </Panel>

    {settlement.journals.length > 0 && <Panel title="Posted journals" description="Settlement accounting entries.">
      <ul className="divide-y rounded-xl border">
        {settlement.journals.map(row => <li key={row.number} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
          <span className="font-mono">{row.number}</span>
          <span className="min-w-0 flex-1 text-muted-foreground">{transactionLabels[row.category] ?? row.category}</span>
          <span className="font-mono tabular-nums">{peso(row.amount)}</span>
        </li>)}
      </ul>
    </Panel>}

    {reversal && <Panel title="Settlement reversal" description={`${reversal.postedByName} · ${dateTime(reversal.postedAt)}`}
      actions={<StatusChip status="REVERSED" label="Reversed" />}>
      <div className="space-y-3">
        <p className="rounded-lg border border-rose-200 bg-rose-50/70 p-2.5 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {reversal.reason}
        </p>
        <Kv rows={[
          ["Savings restored", peso(reversal.savingsRestored)],
          ...reversal.loans.map(loan => [loan.reference, `${peso(loan.remaining)} outstanding`] as [string, string]),
          ...reversal.journals.map(row => [row.number, `Reverses ${row.originalNumber}`] as [string, string]),
        ]} />
      </div>
    </Panel>}
  </>;
}
